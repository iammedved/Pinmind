import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { access, cp, mkdtemp, mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  KernelError, amendContract, captureBaseline, captureEvidence, finalVerify, finalizeRun, freezeContract, hashWithout, initRun, loadState, reconcileActiveRuns, recoverTransition, recordEvidence, recordUnavailableBaseline, redact, redactArgv, redactValue,
  recordUsage, reportRun, routeTask, safeRelativePath, stateResume, stateShow, validateAndSaveExecution, validateContract, validateEvidence,
} from '../skills/pinmind/scripts/lib/core.mjs';
import { main } from '../skills/pinmind/scripts/pinmind.mjs';

const syntheticProviderToken = ['xox', 'b-synthetic-redaction-value'].join('');
const syntheticBearerValue = ['abcdefghijklm', 'nopqrstuvwxyz'].join('');
const syntheticJwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnopqrstuv'].join('.');
const syntheticApiToken = ['sk', 'abcdefghijklmnopqrstuvwxyz'].join('-');
const syntheticPrivateKeyBlock = ['-----BEGIN ', 'PRIVATE KEY-----\nprivate-material\n-----END ', 'PRIVATE KEY-----'].join('');
const syntheticCredentialUrl = ['https://synthetic-user:synthetic-password', 'example.test/x'].join('@');
import { assertSafePackagePaths, swapMarketplaceSource, withInstallLock } from '../scripts/install-personal-release.mjs';

async function workspace() { return mkdtemp(path.join(tmpdir(), 'pinmind-')); }
async function recordTestBaseline(cwd, runId = 'run-one') { return recordUnavailableBaseline(cwd, runId, 'Synthetic test baseline unavailable.'); }
function contract(version = 1, changed = false) {
  return {
    contractId: 'sample-contract', version, status: 'draft', intent: changed ? 'Changed visible behavior.' : 'Provide visible behavior.', actors: ['user'],
    obligations: [{ id: 'REQ-001', type: 'capability', priority: 'must', sourceQuotes: ['User asked for behavior.'], statement: 'Behavior is available.', acceptance: ['AC-001'], invariants: ['INV-001'] }, { id: 'REQ-002', type: 'capability', priority: 'should', sourceQuotes: ['User asked for behavior.'], statement: 'Optional behavior is observed.', acceptance: ['AC-002'], invariants: [] }],
    acceptanceCriteria: [{ id: 'AC-001', given: 'a user', when: 'they act', then: ['they see the behavior'], evidence: ['EV-001'] }, { id: 'AC-002', statement: 'Optional result is present.', observation: 'The result appears in the response.', evidence: ['EV-004'] }],
    invariants: [{ id: 'INV-001', statement: 'Existing behavior remains safe.', evidence: ['EV-002'] }],
    preservation: [{ id: 'PRES-001', statement: 'Public API remains compatible.', evidence: ['EV-003'] }],
    boundaries: { allowed: ['src'], forbidden: ['auth'] }, publicSeams: [], nonFunctional: [], assumptions: ['Host rendering requires observation.'], outOfScope: ['Universal directory publication.'],
  };
}
function evidence(evidenceId, contractVersion, covers, extra = {}) {
  return { evidenceId, contractVersion, covers: [covers], type: 'unit-test', status: 'pass', procedure: 'Manual inspection of the recorded artifact.', observed: 'passed', artifact: 'tests/kernel.test.mjs', provenance: { kind: 'manual-attestation' }, ...extra };
}
function freshnessContract() {
  return {
    contractId: 'freshness-contract', version: 1, status: 'draft', intent: 'Verify current bounded state.', actors: ['user'],
    obligations: [{ id: 'REQ-001', type: 'capability', priority: 'must', sourceQuotes: ['Verify current state.'], statement: 'Current evidence is required.', acceptance: ['AC-001'], invariants: [] }],
    acceptanceCriteria: [{ id: 'AC-001', statement: 'Evidence remains current.', observation: 'The declared relevant files match the captured fingerprint.', freshnessRequired: true, evidence: ['EV-001'] }],
    invariants: [], preservation: [], boundaries: { allowed: ['relevant.txt'], forbidden: [] }, publicSeams: [], nonFunctional: [], assumptions: [], outOfScope: [],
  };
}
async function runProcess(cwd, executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); }); child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${executable} exited ${code}: ${stderr}`)));
  });
}
async function runProcessResult(cwd, executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); }); child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}
async function frozenRun() { const cwd = await workspace(); await initRun(cwd, 'run-one', 'User asked for behavior.'); await recordTestBaseline(cwd); await freezeContract(cwd, 'run-one', contract()); return cwd; }
async function rejects(action, code) { await assert.rejects(action, (error) => error instanceof KernelError && error.code === code); }
async function clonePinmindWorkspace(source) { const cwd = await workspace(); await cp(path.join(source, '.pinmind'), path.join(cwd, '.pinmind'), { recursive: true }); return cwd; }
async function readPendingTransition(cwd) { return JSON.parse(await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8')); }
async function recoverInjectedTransition(cwd, action, step) {
  await rejects(() => action({ faultAfterStep: step }), 'INJECTED_TRANSITION_CRASH');
  const before = await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8');
  const diagnosis = await reconcileActiveRuns(cwd); assert.equal(diagnosis.classification, 'transition-recovery-required');
  assert.equal(await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8'), before, 'reconcile must be byte-preserving');
  await rejects(() => recoverTransition(cwd, '0'.repeat(64)), 'TRANSITION_HASH_MISMATCH');
  const recovered = await recoverTransition(cwd, diagnosis.pendingTransition.transitionSha256); assert.equal(recovered.recovered, true);
  await assert.rejects(access(path.join(cwd, '.pinmind/transition.json')));
  return recovered;
}
async function seededTrials(count, concurrency, worker) {
  for (let start = 0; start < count; start += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, count - start) }, (_, offset) => worker(start + offset)));
  }
}
async function waitForFile(file, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await access(file); return; } catch {}
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${file}`);
}
async function recordAll(cwd, version = 1) {
  await recordEvidence(cwd, 'run-one', evidence('EV-001', version, 'AC-001'));
  await recordEvidence(cwd, 'run-one', evidence('EV-002', version, 'INV-001'));
  await recordEvidence(cwd, 'run-one', evidence('EV-003', version, 'PRES-001'));
}

test('frozen contract detects a silent edit', async () => {
  const cwd = await frozenRun(); const file = path.join(cwd, '.pinmind/runs/run-one/contracts/contract-v001.json'); const value = JSON.parse(await readFile(file, 'utf8')); value.intent = 'Tampered.'; await writeFile(file, JSON.stringify(value));
  await rejects(() => finalVerify(cwd, 'run-one'), 'FROZEN_CONTRACT_CHANGED');
});

test('amendment requires authority, exact normative diff coverage, and records history', async () => {
  const cwd = await frozenRun(); await recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001'));
  const candidateFile = path.join(cwd, 'candidate-v2.json'); await writeFile(candidateFile, JSON.stringify(contract(2, true)));
  await rejects(() => main(['contract', 'amend', '--run', 'run-one', '--file', candidateFile, '--reason', 'Clarification.', '--affects', 'INTENT'], cwd), 'MISSING_ARGUMENT');
  await rejects(() => amendContract(cwd, 'run-one', contract(2, true), 'Clarification.', ['AC-001'], 'approved'), 'INVALID_AMENDMENT');
  const result = await amendContract(cwd, 'run-one', contract(2, true), 'Clarification.', ['INTENT'], 'ticket AWS_SECRET_ACCESS_KEY=synthetic-amendment-value');
  assert.deepEqual(result, { version: 2, changes: ['INTENT'], invalidatedEvidence: ['EV-001'] });
  const amendment = await readFile(path.join(cwd, '.pinmind/runs/run-one/amendments/amendment-v002.json'), 'utf8');
  assert.equal(amendment.includes('synthetic-amendment-value'), false); assert.match(amendment, /INTENT/);
});

test('state hash detects corruption', async () => {
  const cwd = await workspace(); await initRun(cwd, 'state-run', 'User asked for behavior.'); const file = path.join(cwd, '.pinmind/runs/state-run/state.json'); const state = JSON.parse(await readFile(file, 'utf8')); state.phase = 'tampered'; await writeFile(file, JSON.stringify(state));
  await rejects(() => loadState(cwd, 'state-run'), 'CORRUPT_STATE');
});

test('persistent state rejects symlink escapes and accepts a benign workspace alias', async () => {
  const rootCwd = await workspace(); const rootTarget = await workspace();
  await symlink(rootTarget, path.join(rootCwd, '.pinmind'), process.platform === 'win32' ? 'junction' : 'dir');
  await rejects(() => initRun(rootCwd, 'root-link', 'Synthetic brief.'), 'UNSAFE_STATE_PATH');
  assert.deepEqual(await readdir(rootTarget), []);

  const runsCwd = await workspace(); const runsTarget = await workspace();
  await mkdir(path.join(runsCwd, '.pinmind'));
  await symlink(runsTarget, path.join(runsCwd, '.pinmind/runs'), process.platform === 'win32' ? 'junction' : 'dir');
  await rejects(() => initRun(runsCwd, 'runs-link', 'Synthetic brief.'), 'UNSAFE_STATE_PATH');
  assert.deepEqual(await readdir(runsTarget), []);

  const runCwd = await workspace(); const runTarget = await workspace();
  await mkdir(path.join(runCwd, '.pinmind/runs'), { recursive: true });
  await symlink(runTarget, path.join(runCwd, '.pinmind/runs/run-link'), process.platform === 'win32' ? 'junction' : 'dir');
  await rejects(() => loadState(runCwd, 'run-link'), 'UNSAFE_STATE_PATH');

  const contractCwd = await frozenRun(); const externalContract = path.join(await workspace(), 'contract.json');
  const contractFile = path.join(contractCwd, '.pinmind/runs/run-one/contracts/contract-v001.json');
  await writeFile(externalContract, await readFile(contractFile)); await unlink(contractFile); await symlink(externalContract, contractFile, 'file');
  await rejects(() => finalVerify(contractCwd, 'run-one'), 'UNSAFE_STATE_PATH');

  const physicalCwd = await workspace(); const aliasCwd = `${physicalCwd}-alias`;
  await symlink(physicalCwd, aliasCwd, process.platform === 'win32' ? 'junction' : 'dir');
  await initRun(aliasCwd, 'alias-run', 'Synthetic brief.');
  assert.equal((await loadState(aliasCwd, 'alias-run')).state.runId, 'alias-run');
});

test('persistent state rejects symlinks at every root and run entry before touching the target', async () => {
  const entries = [
    ['.pinmind/active.json', 'file'], ['.pinmind/writer.lock', 'file'],
    ['.pinmind/runs/run-one/brief.md', 'file'], ['.pinmind/runs/run-one/state.json', 'file'],
    ['.pinmind/runs/run-one/evidence.json', 'file'], ['.pinmind/runs/run-one/usage.json', 'file'],
    ['.pinmind/runs/run-one/final.md', 'file'], ['.pinmind/runs/run-one/execution.json', 'file'],
    ['.pinmind/runs/run-one/contracts', 'directory'], ['.pinmind/runs/run-one/amendments', 'directory'],
  ];
  for (const [relative, kind] of entries) {
    const cwd = await frozenRun(); const outside = await workspace(); const candidate = path.join(cwd, relative); const target = path.join(outside, kind === 'directory' ? 'target-directory' : 'target-file');
    if (kind === 'directory') await mkdir(target); else await writeFile(target, 'synthetic-outside-sentinel');
    try { await rename(candidate, `${candidate}.local`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await symlink(target, candidate, process.platform === 'win32' && kind === 'directory' ? 'junction' : kind === 'directory' ? 'dir' : 'file');
    await rejects(() => loadState(cwd, 'run-one'), 'UNSAFE_STATE_PATH');
    if (kind === 'directory') assert.deepEqual(await readdir(target), [], relative); else assert.equal(await readFile(target, 'utf8'), 'synthetic-outside-sentinel', relative);
  }
});

test('amendment rejects deletion of a MUST obligation with irrelevant affects', async () => {
  const cwd = await frozenRun(); const candidate = contract(2); candidate.obligations = [];
  await rejects(() => amendContract(cwd, 'run-one', candidate, 'Remove requirement.', ['AC-001'], 'approved'), 'INVALID_AMENDMENT');
});

test('amendment rejects a boundary change without BOUNDARIES and invalidates all on broad change', async () => {
  const cwd = await frozenRun(); await recordAll(cwd); const candidate = contract(2); candidate.boundaries.allowed.push('tests');
  await rejects(() => amendContract(cwd, 'run-one', candidate, 'Broaden boundary.', ['REQ-001'], 'approved'), 'INVALID_AMENDMENT');
  const result = await amendContract(cwd, 'run-one', candidate, 'Broaden boundary.', ['BOUNDARIES'], 'approved');
  assert.deepEqual(result.invalidatedEvidence.sort(), ['EV-001', 'EV-002', 'EV-003']);
});

test('amendment preserves historical evidence and fresh v2 evidence can pass final verification', async () => {
  const cwd = await frozenRun(); await recordAll(cwd); await amendContract(cwd, 'run-one', contract(2, true), 'Clarification.', ['INTENT'], 'approved');
  assert.equal((await validateEvidence(cwd, 'run-one')).ok, true);
  await recordAll(cwd, 2); const store = JSON.parse(await readFile(path.join(cwd, '.pinmind/runs/run-one/evidence.json'), 'utf8'));
  assert.equal(store.entries.length, 6); assert.equal((await finalVerify(cwd, 'run-one')).ok, true);
});

test('contract rejects bad prefixes, missing preservation evidence, and fabricated brief quotes', async () => {
  const bad = contract(); bad.obligations[0].id = 'TASK-001'; delete bad.preservation[0].evidence; bad.exclusions = ['silently ignored'];
  const validation = validateContract(bad); assert.equal(validation.ok, false); assert.match(validation.errors.join('\n'), /invalid REQ id/); assert.match(validation.errors.join('\n'), /planned EV evidence/); assert.match(validation.errors.join('\n'), /Unknown top-level contract field: exclusions/);
  const cwd = await workspace(); await initRun(cwd, 'quote-run', 'User asked for behavior.'); await recordTestBaseline(cwd, 'quote-run'); const fabricated = contract(); fabricated.obligations[0].sourceQuotes = ['A fabricated requirement.'];
  await rejects(() => freezeContract(cwd, 'quote-run', fabricated), 'SOURCE_QUOTE_NOT_IN_BRIEF');
});

test('outOfScope is canonical and its amendment diff requires OUT-OF-SCOPE', async () => {
  const cwd = await frozenRun(); await recordAll(cwd); const candidate = contract(2); candidate.outOfScope = ['A newly excluded concern.'];
  await rejects(() => amendContract(cwd, 'run-one', candidate, 'Clarify scope.', ['INTENT'], 'approved'), 'INVALID_AMENDMENT');
  const result = await amendContract(cwd, 'run-one', candidate, 'Clarify scope.', ['OUT-OF-SCOPE'], 'approved'); assert.deepEqual(result.invalidatedEvidence.sort(), ['EV-001', 'EV-002', 'EV-003']);
  const report = await reportRun(cwd, 'run-one', 'json'); assert.deepEqual(report.remainingBoundaries.outOfScope, ['A newly excluded concern.']); assert.equal(JSON.stringify(report).includes('Universal directory publication.'), false);
});

test('statement-only acceptance requires an explicit observation', () => {
  const candidate = contract(); candidate.acceptanceCriteria[1] = { id: 'AC-002', statement: 'An unobservable assertion.', evidence: ['EV-004'] };
  const result = validateContract(candidate); assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /needs an observation/);
});

test('amendment source quotes permit authority only for new or changed obligations', async () => {
  const cwd = await frozenRun(); const candidate = contract(2); candidate.obligations.push({ id: 'REQ-003', type: 'capability', priority: 'should', sourceQuotes: ['Later user approves catalog behavior.'], statement: 'Catalog behavior is available.', acceptance: [], invariants: [] });
  const result = await amendContract(cwd, 'run-one', candidate, 'Later user addition.', ['REQ-003'], 'Later user approves catalog behavior.'); assert.equal(result.version, 2);
  const failingCwd = await frozenRun(); const invalid = contract(2); invalid.obligations.push({ id: 'REQ-003', type: 'capability', priority: 'should', sourceQuotes: ['Unbacked new behavior.'], statement: 'Catalog behavior is available.', acceptance: [], invariants: [] });
  await rejects(() => amendContract(failingCwd, 'run-one', invalid, 'Later user addition.', ['REQ-003'], 'Different authority text.'), 'SOURCE_QUOTE_NOT_IN_BRIEF');
});

test('evidence enforces type, command/procedure, observed result, pass artifact, and critical sensitivity', async () => {
  const cwd = await frozenRun();
  await rejects(() => recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001', { type: 'made-up' })), 'INVALID_EVIDENCE');
  await rejects(() => recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001', { command: '', procedure: '', observed: '', artifact: '' })), 'INVALID_EVIDENCE');
  const critical = contract(); critical.acceptanceCriteria[0].critical = true; const criticalCwd = await workspace(); await initRun(criticalCwd, 'critical-run', 'User asked for behavior.'); await recordTestBaseline(criticalCwd, 'critical-run'); await freezeContract(criticalCwd, 'critical-run', critical);
  await rejects(() => recordEvidence(criticalCwd, 'critical-run', evidence('EV-001', 1, 'AC-001')), 'INVALID_EVIDENCE');
  await recordEvidence(criticalCwd, 'critical-run', evidence('EV-001', 1, 'AC-001', { sensitivity: { method: 'mutation', observed: 'failed after mutation' } }));
});

test('final verify rejects fabricated command-shaped MUST evidence and capture records trustworthy provenance', async () => {
  const cwd = await frozenRun(); const fabricated = evidence('EV-001', 1, 'AC-001', { command: 'node --test', procedure: undefined, provenance: undefined }); await recordEvidence(cwd, 'run-one', fabricated);
  await recordEvidence(cwd, 'run-one', evidence('EV-002', 1, 'INV-001')); await recordEvidence(cwd, 'run-one', evidence('EV-003', 1, 'PRES-001'));
  assert.equal((await finalVerify(cwd, 'run-one')).ok, false);
  const capturedCwd = await frozenRun(); await writeFile(path.join(capturedCwd, 'capture.txt'), 'captured artifact'); const template = evidence('EV-001', 1, 'AC-001', { artifact: 'capture.txt' }); const templateFile = path.join(capturedCwd, 'capture-template.json'); await writeFile(templateFile, JSON.stringify(template));
  const captured = await main(['evidence', 'capture', '--run', 'run-one', '--file', templateFile, '--cwd', '.', '--', process.execPath, '--version'], capturedCwd); assert.equal(captured.provenance.kind, 'captured-command'); assert.equal(captured.provenance.exitCode, 0);
  await recordEvidence(capturedCwd, 'run-one', evidence('EV-002', 1, 'INV-001')); await recordEvidence(capturedCwd, 'run-one', evidence('EV-003', 1, 'PRES-001')); assert.equal((await finalVerify(capturedCwd, 'run-one')).ok, true);
});

test('final verify requires trustworthy passing evidence for every standalone invariant', async () => {
  const candidate = contract(); candidate.invariants.push({ id: 'INV-002', statement: 'A standalone safety property remains true.', evidence: ['EV-005'] });
  const cwd = await workspace(); await initRun(cwd, 'orphan-invariant', 'User asked for behavior.'); await recordTestBaseline(cwd, 'orphan-invariant'); await freezeContract(cwd, 'orphan-invariant', candidate);
  await recordEvidence(cwd, 'orphan-invariant', evidence('EV-001', 1, 'AC-001')); await recordEvidence(cwd, 'orphan-invariant', evidence('EV-002', 1, 'INV-001')); await recordEvidence(cwd, 'orphan-invariant', evidence('EV-003', 1, 'PRES-001'));
  const result = await finalVerify(cwd, 'orphan-invariant'); assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /INV-002 lacks trustworthy passing evidence/);
  await recordEvidence(cwd, 'orphan-invariant', evidence('EV-005', 1, 'INV-002')); assert.equal((await finalVerify(cwd, 'orphan-invariant')).ok, true);
});

test('final verify requires every planned evidence id for each required target', async () => {
  const candidate = contract(); candidate.acceptanceCriteria[0].evidence = ['EV-001', 'EV-005'];
  const cwd = await workspace(); await initRun(cwd, 'planned-evidence', 'User asked for behavior.'); await recordTestBaseline(cwd, 'planned-evidence'); await freezeContract(cwd, 'planned-evidence', candidate);
  await recordEvidence(cwd, 'planned-evidence', evidence('EV-001', 1, 'AC-001'));
  await recordEvidence(cwd, 'planned-evidence', evidence('EV-002', 1, 'INV-001'));
  await recordEvidence(cwd, 'planned-evidence', evidence('EV-003', 1, 'PRES-001'));
  const missing = await finalVerify(cwd, 'planned-evidence'); assert.equal(missing.ok, false); assert.match(missing.errors.join('\n'), /AC-001 lacks trustworthy passing evidence for planned EV-005/);
  await recordEvidence(cwd, 'planned-evidence', evidence('EV-005', 1, 'AC-001')); assert.equal((await finalVerify(cwd, 'planned-evidence')).ok, true);
});

test('manual attestation cannot close a critical final target', async () => {
  const candidate = contract(); candidate.acceptanceCriteria[0].critical = true;
  const cwd = await workspace(); await initRun(cwd, 'critical-final', 'User asked for behavior.'); await recordTestBaseline(cwd, 'critical-final'); await freezeContract(cwd, 'critical-final', candidate);
  await recordEvidence(cwd, 'critical-final', evidence('EV-001', 1, 'AC-001', { sensitivity: { method: 'manual negative control', observed: 'observer reports a failure without the condition' } }));
  await recordEvidence(cwd, 'critical-final', evidence('EV-002', 1, 'INV-001')); await recordEvidence(cwd, 'critical-final', evidence('EV-003', 1, 'PRES-001'));
  const result = await finalVerify(cwd, 'critical-final'); assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /AC-001 lacks trustworthy passing evidence/);
});

test('evidence store hash detects corruption before validation', async () => {
  const cwd = await frozenRun(); await recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001')); const file = path.join(cwd, '.pinmind/runs/run-one/evidence.json'); const store = JSON.parse(await readFile(file, 'utf8')); store.entries[0].observed = 'tampered'; await writeFile(file, JSON.stringify(store));
  await rejects(() => validateEvidence(cwd, 'run-one'), 'CORRUPT_EVIDENCE');
});

test('evidence rejects stale versions and unknown coverage', async () => {
  const cwd = await frozenRun(); await rejects(() => recordEvidence(cwd, 'run-one', evidence('EV-001', 0, 'AC-001')), 'INVALID_EVIDENCE'); await rejects(() => recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'NOPE-001')), 'INVALID_EVIDENCE');
});

test('execution rejects untraced work, cycles, and overlapping parallel zones', async () => {
  const cwd = await frozenRun();
  await rejects(() => validateAndSaveExecution(cwd, 'run-one', { units: [{ unitId: 'WU-001', obligations: [], criteria: [], zone: ['src'] }] }), 'INVALID_EXECUTION');
  await rejects(() => validateAndSaveExecution(cwd, 'run-one', { units: [{ unitId: 'WU-001', obligations: ['REQ-001'], criteria: [], dependsOn: ['WU-002'], zone: ['src/a'] }, { unitId: 'WU-002', obligations: ['REQ-001'], criteria: [], dependsOn: ['WU-001'], zone: ['src/b'] }] }), 'INVALID_EXECUTION');
  await rejects(() => validateAndSaveExecution(cwd, 'run-one', { units: [{ unitId: 'WU-001', obligations: ['REQ-001'], criteria: [], zone: ['src'] }, { unitId: 'WU-002', obligations: ['REQ-001'], criteria: [], zone: ['src/child'] }] }), 'INVALID_EXECUTION');
});

test('execution accepts sequential zones and safe Windows paths', async () => {
  const cwd = await frozenRun(); const result = await validateAndSaveExecution(cwd, 'run-one', { units: [{ unitId: 'WU-001', obligations: ['REQ-001'], criteria: [], zone: ['src'] }, { unitId: 'WU-002', obligations: ['REQ-001'], criteria: [], dependsOn: ['WU-001'], zone: ['src/child'] }] });
  assert.equal(result.ok, true); assert.equal(safeRelativePath('src\\feature\\file.mjs'), 'src/feature/file.mjs'); assert.throws(() => safeRelativePath('../escape'), KernelError);
});

test('redaction removes headers, cookies, URLs, sessions, private keys, and existing token forms', async () => {
  const envValues = ['synthetic-aws-value', 'synthetic-openai-value', 'synthetic-db-value', 'synthetic-database-url;Pwd=synthetic-semicolon-tail', 'synthetic-json-"quoted"-value', 'synthetic-backtick-value', 'synthetic-comma-value,tail', 'synthetic-dot-value', 'synthetic-paren-value', 'synthetic-bracket-value', 'synthetic-colon-value', 'synthetic-backtick-boundary-value', 'synthetic-js-bracket-"escaped"-value', 'synthetic-python-bracket-value'];
  const secret = `Authorization: Basic dXNlcjpwYXNz\nAuthorization: Bearer ${syntheticBearerValue}\nAuthorization=demo-credential-value\nBearer short7\n${syntheticProviderToken}\n${syntheticJwt}\nCookie: sid=cookie-secret\nSet-Cookie: sessionid=session-secret\nsession=assign-secret\n${syntheticCredentialUrl}\n${syntheticPrivateKeyBlock}\ntoken=plain-secret ${syntheticApiToken}\nAWS_SECRET_ACCESS_KEY=${envValues[0]}\nexport OPENAI_API_KEY='${envValues[1]}'\nDB_PASSWORD=${envValues[2]}\nDATABASE_URL=${envValues[3]}\n${JSON.stringify({ SERVICE_TOKEN: envValues[4] })}\nOPENAI_API_KEY=\`${envValues[5]}\`\nACCESS_KEY=${envValues[6]}\nprocess.env.DATABASE_URL=${envValues[7]}\n(OPENAI_API_KEY=${envValues[8]})\n[ACCESS_KEY=${envValues[9]}]\nconfig:DB_PASSWORD=${envValues[10]}\n\`ACCESS_KEY=${envValues[11]}\`\nprocess.env["DATABASE_URL"] = ${JSON.stringify(envValues[12])};\nos.environ['ACCESS_KEY'] = '${envValues[13]}'\nLOG_LEVEL=debug\nTOKEN_TTL=60\nTOKEN_BUCKET_SIZE=10\nPASSWORD_POLICY=strict`;
  const redacted = redact(secret); for (const value of ['dXNlcjpwYXNz', syntheticBearerValue, 'demo-credential-value', 'short7', syntheticProviderToken, 'eyJhbGciOiJIUzI1NiJ9', 'cookie-secret', 'session-secret', 'assign-secret', 'synthetic-user:synthetic-password', 'private-material', 'plain-secret', syntheticApiToken, ...envValues]) assert.equal(redacted.includes(value), false, value);
  for (const ordinary of ['LOG_LEVEL=debug', 'TOKEN_TTL=60', 'TOKEN_BUCKET_SIZE=10', 'PASSWORD_POLICY=strict']) assert.ok(redacted.includes(ordinary), ordinary);
  assert.deepEqual(JSON.parse(redact(JSON.stringify({ SERVICE_TOKEN: envValues[4], TOKEN_TTL: 60 }))), { SERVICE_TOKEN: '[REDACTED]', TOKEN_TTL: 60 });
  const nested = redactValue({ Cookie: 'cookie-value', nested: { session: 'session-value', sid: 'sid-value', 'set-cookie': 'set-cookie-value' } }); for (const value of ['cookie-value', 'session-value', 'sid-value', 'set-cookie-value']) assert.equal(JSON.stringify(nested).includes(value), false, value);
  assert.deepEqual(redactArgv(['tool', '--token', 'synthetic-value', '--api-key=synthetic-equals-value', '--label', 'safe']), ['[REDACTED EXECUTABLE]', '[REDACTED ARG]', '[REDACTED ARG]', '[REDACTED ARG]', '[REDACTED ARG]', '[REDACTED ARG]']);
});

test('captured evidence executes original argv but persists only sanitized command provenance', async () => {
  const cwd = await frozenRun();
  const separateSecret = ['synthetic', '-separate-command-value'].join('');
  const assignedSecret = ['synthetic', '-assigned-command-value'].join('');
  const userInfoSecret = ['synthetic-user:', 'synthetic-password-value'].join('');
  const shortUserSecret = ['synthetic-short-user:', 'synthetic-short-password'].join('');
  const accessTokenSecret = ['synthetic', '-access-token-value'].join('');
  const positionalSecret = ['synthetic', '-positional-private-value'].join('');
  const outputEnvSecret = ['synthetic', '-env-output-value'].join('');
  const artifact = 'executed-argv.json';
  const childScript = "const { createHash } = require('node:crypto'); const { writeFileSync } = require('node:fs'); const args = process.argv.slice(1); const outputSecret = args[args.indexOf('--output-secret') + 1]; writeFileSync('executed-argv.json', JSON.stringify(args.map((value) => createHash('sha256').update(value).digest('hex')))); process.stdout.write(`OPENAI_API_KEY=${outputSecret}\\n`);";
  const argv = [process.execPath, '-e', childScript, '--', '--token', separateSecret, `--api-key=${assignedSecret}`, '--user', userInfoSecret, '-u', shortUserSecret, '--access-token', accessTokenSecret, positionalSecret, '--output-secret', outputEnvSecret, '--label', 'safe'];
  const captured = await captureEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001', { artifact }), argv);
  const executedHashes = JSON.parse(await readFile(path.join(cwd, artifact), 'utf8'));
  for (const value of [separateSecret, `--api-key=${assignedSecret}`, userInfoSecret, shortUserSecret, accessTokenSecret, positionalSecret, outputEnvSecret]) assert.ok(executedHashes.includes(createHash('sha256').update(value).digest('hex')), value);
  const rawEvidence = await readFile(path.join(cwd, '.pinmind/runs/run-one/evidence.json'), 'utf8');
  for (const value of [separateSecret, assignedSecret, userInfoSecret, shortUserSecret, accessTokenSecret, positionalSecret, outputEnvSecret]) {
    assert.equal(rawEvidence.includes(value), false, value);
    assert.equal(captured.command.includes(value), false, value);
  }
  assert.match(captured.provenance.argv[0], /^node(?:js)?(?:\.exe)?$/i);
  assert.equal(captured.provenance.argv.length, argv.length);
  assert.ok(captured.provenance.argv.slice(1).every((value) => value === '[REDACTED ARG]'));
});

test('router executes all RU/EN and adversarial route fixtures', async () => {
  const fixtures = JSON.parse(await readFile(fileURLToPath(new URL('../evals/fixtures/routes.json', import.meta.url)), 'utf8')); assert.ok(fixtures.length >= 50);
  for (const fixture of fixtures) {
    const actual = routeTask(fixture.input); assert.equal(actual.route, fixture.expected, fixture.name); if (fixture.risk) assert.equal(actual.risk, fixture.risk, fixture.name); if (fixture.clarity) assert.equal(actual.clarity, fixture.clarity, fixture.name); if (fixture.executionSpan) assert.equal(actual.executionSpan, fixture.executionSpan, fixture.name); assert.equal(typeof actual.reason, 'string', `${fixture.name} reason type`); assert.ok(actual.reason.length > 0, `${fixture.name} reason`); assert.ok(Array.isArray(actual.signals) && actual.signals.length > 0, `${fixture.name} signals`); assert.match(actual.confidence, /^(high|medium|low)$/, `${fixture.name} confidence`); assert.equal(typeof actual.needsHumanConfirmation, 'boolean', `${fixture.name} confirmation type`); if (fixture.reasonIncludes) assert.match(actual.reason.toLowerCase(), new RegExp(fixture.reasonIncludes), `${fixture.name} reason content`); if (fixture.confidence) assert.equal(actual.confidence, fixture.confidence, `${fixture.name} confidence`); if (fixture.needsHumanConfirmation !== undefined) assert.equal(actual.needsHumanConfirmation, fixture.needsHumanConfirmation, `${fixture.name} confirmation`); for (const signal of fixture.signalsInclude || []) assert.ok(actual.signals.includes(signal), `${fixture.name} signal ${signal}`); for (const signal of fixture.signalsExclude || []) assert.ok(!actual.signals.includes(signal), `${fixture.name} excludes signal ${signal}`);
  }
  assert.equal(routeTask({ kind: 'simple', text: 'Add payment integration' }).route, 'software-change');
  for (const kind of ['audit', 'investigation']) {
    const actual = routeTask({ kind, text: 'Add payment integration with a webhook' });
    assert.equal(actual.route, kind, `${kind} explicit route`); assert.equal(actual.risk, 'high', `${kind} risk`); assert.equal(actual.executionSpan, 'multi-system', `${kind} span`); assert.equal(typeof actual.reason, 'string', `${kind} reason type`); assert.ok(actual.reason.length > 0, `${kind} reason`);
  }
  const cli = await main(['route', '--text', 'Добавь платежную интеграцию', '--kind', 'audit']); assert.equal(cli.route, 'audit'); assert.equal(typeof cli.reason, 'string');
  const investigationCli = await main(['route', '--text', 'Why does login sometimes return 500?']); assert.equal(investigationCli.route, 'investigation'); assert.equal(typeof investigationCli.reason, 'string');
});

test('CLI rejects unknown and repeated flags without changing valid commands', async () => {
  const commands = [
    ['init'], ['route'], ['state', 'show'], ['state', 'resume'], ['state', 'reconcile'], ['state', 'recover'], ['report'],
    ['baseline', 'capture'], ['baseline', 'unavailable'], ['contract', 'validate'], ['contract', 'freeze'], ['contract', 'amend'],
    ['execution', 'validate'], ['evidence', 'record'], ['evidence', 'capture'], ['evidence', 'validate'], ['usage', 'record'],
    ['final', 'check'], ['final', 'verify'], ['finalize'],
  ];
  for (const command of commands) await rejects(() => main([...command, '--unexpected-flag', 'x']), 'UNKNOWN_FLAG');
  await rejects(() => main(['route', '--text', 'Hello', '--text', 'Привет']), 'DUPLICATE_FLAG');
  await rejects(() => main(['route', 'spare-positional', '--text', 'Hello']), 'UNEXPECTED_POSITIONAL');
  await rejects(() => main(['state', 'show', 'spare-positional', '--run', 'one']), 'UNEXPECTED_POSITIONAL');
  await rejects(() => main(['route', '--text', 'Hello', '--', '--unexpected-flag', 'x']), 'UNEXPECTED_POSITIONAL');
  await rejects(() => main(['route', '--text', 'Hello', '--', 'spare-positional']), 'UNEXPECTED_POSITIONAL');
  const cliPath = fileURLToPath(new URL('../skills/pinmind/scripts/pinmind.mjs', import.meta.url));
  const publicCli = await runProcessResult(process.cwd(), process.execPath, [cliPath, 'route', 'spare-positional', '--text', 'Hello']);
  assert.equal(publicCli.code, 1); assert.equal(publicCli.stdout, '', 'the public CLI must not emit a successful route');
  const dividerBypass = await runProcessResult(process.cwd(), process.execPath, [cliPath, 'route', '--text', 'Hello', '--', '--unexpected-flag', 'x']);
  assert.equal(dividerBypass.code, 1); assert.equal(dividerBypass.stdout, '', 'the public CLI must reject ignored command arguments');
  const routed = await main(['route', '--text', 'Hello']);
  assert.equal(routed.route, 'simple');
});

test('discovery metadata is concise, bilingual, implicit, and keeps trivial exclusions', async () => {
  const skill = await readFile(fileURLToPath(new URL('../skills/pinmind/SKILL.md', import.meta.url)), 'utf8');
  const agent = await readFile(fileURLToPath(new URL('../skills/pinmind/agents/openai.yaml', import.meta.url)), 'utf8');
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../.codex-plugin/plugin.json', import.meta.url)), 'utf8'));
  const description = skill.match(/^---\n[\s\S]*?^description:\s*(.+)$/m)?.[1] || '';
  assert.match(description, /Русск|русск/u); assert.match(description, /research|исслед/u); assert.match(description, /diagnos|диагност/u); assert.match(description, /Do not use|Не использ/u); assert.match(description, /run.*route.*before.*(?:memory|references|workspace)/iu); assert.ok(description.length < 700); assert.doesNotMatch(description, /every task|any request|любая задача|всегда/iu);
  assert.match(agent, /allow_implicit_invocation:\s*true/); assert.match(agent, /русск|Russian|RU\/EN/iu);
  assert.match(`${manifest.interface.longDescription} ${manifest.interface.defaultPrompt.join(' ')}`, /русск|Russian|RU\/EN/iu);
});

test('public release documentation, license, metadata, evaluation guides, and hero asset stay coherent', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
  const roadmap = await readFile(path.join(root, 'ROADMAP.md'), 'utf8');
  const p2Architecture = await readFile(path.join(root, 'docs/p2-architecture.md'), 'utf8');
  const languageGuide = await readFile(path.join(root, 'LANGUAGE_ROUTING.md'), 'utf8');
  const aepGuide = await readFile(path.join(root, 'ADAPTIVE_EXECUTION_POLICY.md'), 'utf8');
  const hero = await readFile(path.join(root, 'docs/assets/pinmind-hero.png'));
  const skill = await readFile(path.join(root, 'skills/pinmind/SKILL.md'), 'utf8');
  const agent = await readFile(path.join(root, 'skills/pinmind/agents/openai.yaml'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const marketplace = JSON.parse(await readFile(path.join(root, '.agents/plugins/marketplace.json'), 'utf8'));
  const contributing = await readFile(path.join(root, '.github/CONTRIBUTING.md'), 'utf8');
  const pullRequestTemplate = await readFile(path.join(root, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8');
  const security = await readFile(path.join(root, 'SECURITY.md'), 'utf8');
  const privacy = await readFile(path.join(root, 'PRIVACY.md'), 'utf8');
  const support = await readFile(path.join(root, 'SUPPORT.md'), 'utf8');
  const terms = await readFile(path.join(root, 'TERMS.md'), 'utf8');
  const description = skill.match(/^---\n[\s\S]*?^description:\s*(.+)$/m)?.[1] || '';
  const baseVersion = manifest.version.split('+')[0];
  const escapedBaseVersion = baseVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\+codex\.[0-9A-Za-z.-]+)?$/);
  assert.equal(baseVersion, '0.6.0');
  assert.match(manifest.description, /^Adaptive RU\/EN task controller/);
  assert.match(description, /^"Default RU\/EN controller/);
  assert.match(agent, /short_description:\s*"Adaptive verified RU\/EN task controller"/);
  for (const section of ['## Install, configure, and run', '## What Pinmind does', '## Kernel CLI', '## Versioning', '## Limitations']) assert.match(readme, new RegExp(section));
  assert.match(readme, new RegExp(`Current source version:\\s*\`${escapedBaseVersion}\``));
  assert.match(readme, /Universal Plugins Directory:\s*\*\*not listed yet\*\*/);
  for (const term of ['$skill-installer', '/skills', '$pinmind', '/plugins', 'Plugins Directory', '@Pinmind', 'Route: audit |', `codex plugin marketplace add iammedved/Pinmind --ref v${baseVersion}`]) assert.ok(readme.includes(term), term);
  assert.match(readme, /https:\/\/github\.com\/iammedved\/Pinmind/);
  assert.match(readme, /needs no connector, external account, API key, or MCP server/);
  assert.doesNotMatch(readme, /pinmind@personal|personal marketplace|install-personal-release/iu);
  assert.equal(readme.includes(['', 'home', ''].join('/')), false);
  assert.equal(readme.includes(['', 'Users', ''].join('\\')), false);
  assert.match(readme, /!\[[^\]]*Pinmind[^\]]*\]\(docs\/assets\/pinmind-hero\.png\)/i);
  assert.deepEqual([...hero.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(hero.readUInt32BE(16), 1672);
  assert.equal(hero.readUInt32BE(20), 941);
  assert.equal(createHash('sha256').update(hero).digest('hex'), '3219be9fc321fa58704e8594793f15c818ef15f0b8630bf80cb5f8757372f515');
  assert.equal(manifest.interface.logo, './docs/assets/pinmind-hero.png');
  assert.equal(manifest.interface.composerIcon, './docs/assets/pinmind-hero.png');
  assert.deepEqual(await readFile(path.join(root, manifest.interface.logo.slice(2))), hero);
  assert.match(readme, /\[CHANGELOG\.md\]\(CHANGELOG\.md\)/);
  assert.match(readme, /\[ADAPTIVE_EXECUTION_POLICY\.md\]\(ADAPTIVE_EXECUTION_POLICY\.md\)/);
  assert.match(readme, /\[P2 architecture decision\]\(docs\/p2-architecture\.md\)/);
  assert.equal(manifest.author.name, 'Pinmind Project');
  assert.equal(manifest.interface.developerName, 'Pinmind Project');
  for (const personalUrlField of ['homepage', 'repository']) assert.equal(personalUrlField in manifest, false);
  assert.equal('url' in manifest.author, false);
  assert.equal('websiteURL' in manifest.interface, false);
  assert.equal(marketplace.name, 'pinmind-project');
  assert.equal(marketplace.interface.displayName, 'Pinmind Project');
  assert.deepEqual(marketplace.plugins.map(({ name, source, policy, category }) => ({ name, source, policy, category })), [{
    name: 'pinmind', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity',
  }]);
  assert.match(license, /Copyright \(c\) 2026 Pinmind Project/);
  assert.match(contributing, /only actor who merges, tags, or publishes/);
  assert.match(pullRequestTemplate, /does not grant write or merge access/);
  assert.match(security, /Security → Report a vulnerability/);
  assert.match(privacy, /no account system, connector, MCP server, telemetry service/);
  assert.match(privacy, new RegExp(`Pinmind \`${escapedBaseVersion}\``));
  assert.match(support, /minimal synthetic example/);
  assert.match(terms, /MIT License/);
  const publicMetadata = `${readme}\n${changelog}\n${license}\n${roadmap}\n${p2Architecture}\n${languageGuide}\n${aepGuide}\n${JSON.stringify(manifest)}\n${JSON.stringify(marketplace)}\n${contributing}\n${pullRequestTemplate}\n${security}\n${privacy}\n${support}\n${terms}`;
  assert.doesNotMatch(publicMetadata, /(?:\/home\/|[A-Za-z]:\\Users\\)[A-Za-z0-9._-]+/i);
  assert.doesNotMatch(publicMetadata, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  assert.equal(JSON.stringify(manifest).includes('@'), false);
  for (const term of ['Host selection', 'Post-activation routing', 'End-task utility', 'SkillsBench', 'SkillRouter', 'AgentAbstain', 'MASSIVE', 'pairId', 'mustNotMutate']) assert.match(languageGuide, new RegExp(term, 'i'), term);
  for (const term of ['workShape', 'desiredProfile', 'actualProfile', 'verificationOracle', 'provider-neutral', '16 original synthetic contrast cases']) assert.match(`${readme}\n${aepGuide}`, new RegExp(term, 'i'), term);
  for (const term of ['adapters before runtime', 'Luna / low', 'Terra / medium', 'Sol / high', 'shadow', 'idempotency', '50 deterministic']) assert.match(p2Architecture, new RegExp(term, 'i'), term);
  assert.match(changelog, /## \[Unreleased\]/);
  assert.match(changelog, /No target version is assigned/);
  assert.match(changelog, new RegExp(`## \\[${escapedBaseVersion}\\] - \\d{4}-\\d{2}-\\d{2}`));
  assert.match(changelog, /## \[0\.4\.0-experimental\] - 2026-08-17/);
  assert.match(changelog, /## \[0\.3\.1-experimental\] - 2026-08-17/);
  assert.match(changelog, /## \[0\.3\.0-experimental\] - 2026-08-17/);
  assert.match(`${readme}\n${changelog}`, /immutable baseline/);
  assert.match(`${readme}\n${changelog}`, /experimental.*(?:history|baseline)|(?:history|baseline).*experimental/is);
  assert.match(changelog, /## \[0\.2\.4\] - 2026-08-17/);
  assert.match(changelog, /## \[0\.2\.3\] - 2026-08-17/);
  assert.match(changelog, /## \[0\.2\.2\] - 2026-08-17/);
  assert.match(changelog, /## \[0\.2\.1\] - 2026-08-16/);
  assert.match(changelog, /## \[0\.2\.0\] - 2026-08-16/);
  assert.match(changelog, /Semantic Versioning/);
});

test('release packaging rejects private runtime and repository metadata', () => {
  assert.doesNotThrow(() => assertSafePackagePaths(['.codex-plugin/plugin.json', 'skills/pinmind/SKILL.md']));
  assert.throws(() => assertSafePackagePaths(['.pinmind/active.json']), /Forbidden runtime\/private path/);
  assert.throws(() => assertSafePackagePaths(['.git/config']), /Forbidden runtime\/private path/);
  assert.throws(() => assertSafePackagePaths(['skills/pinmind/.pinmind/private.json']), /Forbidden runtime\/private path/);
});

test('release installer restores the previous marketplace source when installation fails', async () => {
  const cwd = await workspace();
  const marketplaceSource = path.join(cwd, 'pinmind');
  const staged = path.join(cwd, 'staged');
  const backup = path.join(cwd, 'backup');
  const failed = path.join(cwd, 'failed');
  await mkdir(marketplaceSource); await writeFile(path.join(marketplaceSource, 'marker'), 'previous');
  await mkdir(staged); await writeFile(path.join(staged, 'marker'), 'candidate');
  await assert.rejects(
    () => swapMarketplaceSource({ marketplaceSource, staged, backup, failed, installAndVerify: async () => { throw new Error('simulated install failure'); } }),
    /simulated install failure/,
  );
  assert.equal(await readFile(path.join(marketplaceSource, 'marker'), 'utf8'), 'previous');
  await assert.rejects(access(backup)); await assert.rejects(access(failed)); await assert.rejects(access(staged));
});

test('release installer commits a verified source and serializes concurrent swaps', async () => {
  const cwd = await workspace();
  const marketplaceSource = path.join(cwd, 'pinmind');
  const staged = path.join(cwd, 'staged');
  const backup = path.join(cwd, 'backup');
  const failed = path.join(cwd, 'failed');
  await mkdir(marketplaceSource); await writeFile(path.join(marketplaceSource, 'marker'), 'previous');
  await mkdir(staged); await writeFile(path.join(staged, 'marker'), 'candidate');
  await swapMarketplaceSource({ marketplaceSource, staged, backup, failed, installAndVerify: async () => {} });
  assert.equal(await readFile(path.join(marketplaceSource, 'marker'), 'utf8'), 'candidate');
  await assert.rejects(access(backup));

  const installLock = path.join(cwd, 'install.lock');
  let releaseLock;
  const held = withInstallLock(installLock, () => new Promise((resolve) => { releaseLock = resolve; }));
  while (!releaseLock) await delay(1);
  await assert.rejects(() => withInstallLock(installLock, async () => {}), /Another Pinmind release installation owns/);
  releaseLock(); await held; await assert.rejects(access(installLock));
});

test('usage defaults to unavailable and reports exact observed totals without estimates', async () => {
  const cwd = await frozenRun();
  const initial = await reportRun(cwd, 'run-one', 'json'); assert.equal(initial.tokenUsage.status, 'unavailable'); assert.equal(initial.tokenUsage.totalTokens, null); assert.match(initial.tokenUsage.reason, /did not expose|not recorded/i); assert.deepEqual(initial.remainingBoundaries, { assumptions: ['Host rendering requires observation.'], outOfScope: ['Universal directory publication.'] });
  await recordUsage(cwd, 'run-one', { status: 'unavailable', source: 'host-unavailable', scope: 'task', capturedAt: '2026-08-16T17:59:00.000Z', reason: `Authorization=demo-credential-value ${syntheticProviderToken}` }); const unavailable = await reportRun(cwd, 'run-one', 'json'); assert.equal(JSON.stringify(unavailable).includes('demo-credential-value'), false); assert.equal(JSON.stringify(unavailable).includes(syntheticProviderToken), false);
  const observed = await recordUsage(cwd, 'run-one', { status: 'actual', source: 'codex-sdk', scope: 'task', model: 'gpt-5.6', inputTokens: 1200, cachedInputTokens: 400, outputTokens: 300, reasoningOutputTokens: 50, capturedAt: '2026-08-16T18:00:00.000Z', reference: 'turn-123' });
  assert.equal(observed.totalTokens, 1500); assert.equal(observed.reference, 'turn-123');
  const report = await reportRun(cwd, 'run-one', 'json'); assert.equal(report.tokenUsage.totalTokens, 1500); assert.equal(report.tokenUsage.inputTokens, 1200); assert.equal(report.tokenUsage.outputTokens, 300); assert.equal(report.tokenUsage.cachedInputTokens, 400); assert.equal(report.tokenUsage.reasoningOutputTokens, 50); assert.equal('reference' in report.tokenUsage, false);
  const markdown = await reportRun(cwd, 'run-one', 'md'); assert.match(markdown, /Total: 1,500/); assert.match(markdown, /Source: codex-sdk/); assert.match(markdown, /## Remaining boundaries/); assert.match(markdown, /Host rendering requires observation/); assert.match(markdown, /Universal directory publication/); assert.doesNotMatch(markdown, /saved|saving|сэконом/iu);
});

test('usage rejects malformed metadata or inconsistent counts and detects accidental receipt corruption', async () => {
  const cwd = await frozenRun(); const base = { status: 'actual', source: 'app-server', scope: 'task', inputTokens: 100, outputTokens: 20, capturedAt: '2026-08-16T18:00:00.000Z' };
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, inputTokens: -1 }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, totalTokens: 999 }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, cachedInputTokens: 101 }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, source: 'host-unavailable' }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, format: 2 }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, capturedAt: '1' }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, model: 'gpt-5.6\n- injected: true' }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, reference: 'Authorization=demo-credential-value' }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, reference: syntheticProviderToken }), 'INVALID_USAGE');
  await rejects(() => recordUsage(cwd, 'run-one', { ...base, reference: syntheticJwt }), 'INVALID_USAGE');
  await recordUsage(cwd, 'run-one', base); const file = path.join(cwd, '.pinmind/runs/run-one/usage.json'); const receipt = JSON.parse(await readFile(file, 'utf8')); receipt.outputTokens = 21; await writeFile(file, JSON.stringify(receipt));
  await rejects(() => reportRun(cwd, 'run-one', 'json'), 'CORRUPT_USAGE');
});

test('report is read-only and CLI records authoritative usage', async () => {
  const cwd = await frozenRun(); const usageFile = path.join(cwd, 'usage-input.json'); await writeFile(usageFile, JSON.stringify({ status: 'actual', source: 'codex-exec-json', scope: 'task', inputTokens: 77, outputTokens: 23, capturedAt: '2026-08-16T18:00:00.000Z' }));
  const recorded = await main(['usage', 'record', '--run', 'run-one', '--file', usageFile], cwd); assert.equal(recorded.totalTokens, 100);
  const run = path.join(cwd, '.pinmind/runs/run-one'); const canonical = ['brief.md', 'state.json', 'evidence.json', 'usage.json', 'contracts/contract-v001.json']; const before = await Promise.all(canonical.map((file) => readFile(path.join(run, file), 'utf8'))); const markdown = await main(['report', '--run', 'run-one', '--format', 'md'], cwd); const json = await main(['report', '--run', 'run-one', '--format', 'json'], cwd); const after = await Promise.all(canonical.map((file) => readFile(path.join(run, file), 'utf8')));
  assert.deepEqual(before, after); await assert.rejects(readFile(path.join(run, 'final.md'), 'utf8')); assert.match(markdown, /Total: 100/); assert.equal(json.tokenUsage.totalTokens, 100);
});

test('every Pinmind final path, including manual simple, requires a token line', async () => {
  const skill = await readFile(fileURLToPath(new URL('../skills/pinmind/SKILL.md', import.meta.url)), 'utf8');
  const simple = routeTask({ kind: 'simple', text: 'Привет' }); assert.equal(simple.route, 'simple');
  assert.match(skill, /every task while Pinmind is active|кажд.*задач.*Pinmind/iu); assert.match(skill, /including.*simple|включая.*simple/iu); assert.match(skill, /Token usage|Токены/iu); assert.match(skill, /unavailable|недоступ/iu);
});

test('baseline receipts preserve green, pre-existing failure, and explicit unavailable outcomes', async () => {
  const greenCwd = await workspace(); await writeFile(path.join(greenCwd, 'relevant.txt'), 'baseline'); await initRun(greenCwd, 'run-one', 'Verify current state.');
  const green = await captureBaseline(greenCwd, 'run-one', { freshnessPaths: ['relevant.txt'] }, [process.execPath, '-e', 'process.exit(0)']); assert.equal(green.status, 'green'); assert.equal(green.provenance.exitCode, 0); assert.equal((await reportRun(greenCwd, 'run-one')).baseline.status, 'green');
  await rejects(() => recordUnavailableBaseline(greenCwd, 'run-one', 'late'), 'BASELINE_EXISTS');

  const redCwd = await workspace(); await initRun(redCwd, 'run-one', 'Verify current state.');
  const red = await captureBaseline(redCwd, 'run-one', { freshnessPaths: [] }, [process.execPath, '-e', "console.error('pre-existing-red'); process.exitCode = 3"]); assert.equal(red.status, 'pre-existing-failure'); assert.equal(red.provenance.exitCode, 3); assert.equal(red.observed, 'Captured exit code 3.');
  const redBefore = await readFile(path.join(redCwd, '.pinmind/runs/run-one/baseline.json'), 'utf8'); await freezeContract(redCwd, 'run-one', freshnessContract()); assert.equal(await readFile(path.join(redCwd, '.pinmind/runs/run-one/baseline.json'), 'utf8'), redBefore);

  const unavailableCwd = await workspace(); await initRun(unavailableCwd, 'run-one', 'Verify current state.');
  const unavailable = await recordUnavailableBaseline(unavailableCwd, 'run-one', 'No affordable project check is available.'); assert.equal(unavailable.status, 'unavailable'); assert.match(unavailable.reason, /No affordable/);
  const lateCwd = await frozenRun(); await rejects(() => recordUnavailableBaseline(lateCwd, 'run-one', 'Too late.'), 'BASELINE_EXISTS');
});

test('new runs fail closed without an explicit baseline while legacy state remains readable', async () => {
  const cwd = await workspace(); await initRun(cwd, 'run-one', 'User asked for behavior.');
  await rejects(() => freezeContract(cwd, 'run-one', contract()), 'BASELINE_REQUIRED');
  await recordTestBaseline(cwd); const baselineFile = path.join(cwd, '.pinmind/runs/run-one/baseline.json'); const baseline = JSON.parse(await readFile(baselineFile, 'utf8')); baseline.reason = 'tampered'; await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  await rejects(() => freezeContract(cwd, 'run-one', contract()), 'CORRUPT_BASELINE');

  const legacyCwd = await workspace(); await initRun(legacyCwd, 'run-one', 'User asked for behavior.');
  const stateFile = path.join(legacyCwd, '.pinmind/runs/run-one/state.json'); const state = JSON.parse(await readFile(stateFile, 'utf8')); delete state.baselineRequired; state.stateSha256 = hashWithout(state, 'stateSha256'); await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  await freezeContract(legacyCwd, 'run-one', contract()); assert.equal((await finalVerify(legacyCwd, 'run-one')).baseline.status, 'unavailable');
});

test('Git-scoped freshness ignores unrelated dirty files, rejects relevant mutation, and recapture restores pass', async () => {
  const cwd = await workspace(); await runProcess(cwd, 'git', ['init']); await runProcess(cwd, 'git', ['config', 'user.email', 'pinmind@example.test']); await runProcess(cwd, 'git', ['config', 'user.name', 'Pinmind Test']);
  await writeFile(path.join(cwd, 'relevant.txt'), 'v1'); await writeFile(path.join(cwd, 'unrelated.txt'), 'u1'); await runProcess(cwd, 'git', ['add', 'relevant.txt', 'unrelated.txt']); await runProcess(cwd, 'git', ['commit', '-m', 'baseline']);
  await initRun(cwd, 'run-one', 'Verify current state.'); await captureBaseline(cwd, 'run-one', { freshnessPaths: ['relevant.txt'] }, [process.execPath, '-e', 'process.exit(0)']); await freezeContract(cwd, 'run-one', freshnessContract());
  const template = evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'freshness-check', freshnessPaths: ['relevant.txt'] });
  const captured = await captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', 'process.exit(0)']); assert.equal(captured.provenance.workspaceFingerprint.kind, 'git-paths-v1'); assert.equal((await finalVerify(cwd, 'run-one')).verdict, 'pass');
  await writeFile(path.join(cwd, 'unrelated.txt'), 'u2'); assert.equal((await finalVerify(cwd, 'run-one')).verdict, 'pass');
  const canonical = ['.pinmind/active.json', '.pinmind/runs/run-one/state.json', '.pinmind/runs/run-one/evidence.json']; const before = await Promise.all(canonical.map((file) => readFile(path.join(cwd, file), 'utf8')));
  const first = await main(['final', 'check', '--run', 'run-one'], cwd); const second = await main(['final', 'check', '--run', 'run-one'], cwd); assert.deepEqual(second, first); assert.deepEqual(await Promise.all(canonical.map((file) => readFile(path.join(cwd, file), 'utf8'))), before); await assert.rejects(access(path.join(cwd, '.pinmind/runs/run-one/final.md')));
  await writeFile(path.join(cwd, 'relevant.txt'), 'v2'); const stale = await finalVerify(cwd, 'run-one'); assert.equal(stale.verdict, 'fail'); assert.match(stale.errors.join('\n'), /stale freshness.*EV-001/);
  await captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', 'process.exit(0)']); assert.equal((await finalVerify(cwd, 'run-one')).verdict, 'pass'); const finalized = await main(['finalize', '--run', 'run-one'], cwd); assert.equal(finalized.finalized, true);
});

test('no-Git declared artifacts are fingerprinted and missing freshness scope fails closed', async () => {
  const cwd = await workspace(); await writeFile(path.join(cwd, 'relevant.txt'), 'v1'); await initRun(cwd, 'run-one', 'Verify current state.'); await captureBaseline(cwd, 'run-one', { freshnessPaths: ['relevant.txt'] }, [process.execPath, '-e', 'process.exit(0)']); await freezeContract(cwd, 'run-one', freshnessContract());
  const template = evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'artifact-check', freshnessPaths: ['relevant.txt'] });
  const captured = await captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', 'process.exit(0)']); assert.equal(captured.provenance.workspaceFingerprint.kind, 'artifacts-v1'); assert.equal((await finalVerify(cwd, 'run-one')).verdict, 'pass');
  await unlink(path.join(cwd, 'relevant.txt')); const stale = await finalVerify(cwd, 'run-one'); assert.equal(stale.verdict, 'fail'); assert.match(stale.errors.join('\n'), /unavailable freshness.*EV-001/);

  const missingCwd = await workspace(); await initRun(missingCwd, 'run-one', 'Verify current state.'); await recordTestBaseline(missingCwd); await freezeContract(missingCwd, 'run-one', freshnessContract());
  await captureEvidence(missingCwd, 'run-one', evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'missing-check', freshnessPaths: ['missing.txt'] }), [process.execPath, '-e', 'process.exit(0)']);
  const unavailable = await finalVerify(missingCwd, 'run-one'); assert.equal(unavailable.verdict, 'fail'); assert.match(unavailable.errors.join('\n'), /unavailable freshness.*EV-001/);
});

test('final check is read-only, final verify stays compatible, and resume stays blocked', async () => {
  const cwd = await workspace(); await initRun(cwd, 'first-run', 'User asked for behavior.'); await rejects(() => initRun(cwd, 'second-run', 'User asked for behavior.'), 'ACTIVE_RUN_EXISTS');
  await recordTestBaseline(cwd, 'first-run'); const candidate = path.join(cwd, 'contract.json'); await writeFile(candidate, JSON.stringify(contract())); await main(['contract', 'freeze', '--run', 'first-run', '--file', candidate], cwd);
  for (const [id, target] of [['EV-001', 'AC-001'], ['EV-002', 'INV-001'], ['EV-003', 'PRES-001'], ['EV-004', 'AC-002']]) { const file = path.join(cwd, `${id}.json`); await writeFile(file, JSON.stringify(evidence(id, 1, target, id === 'EV-004' ? { status: 'uncertain' } : {}))); await main(['evidence', 'record', '--run', 'first-run', '--file', file], cwd); }
  const canonical = ['.pinmind/active.json', '.pinmind/runs/first-run/state.json', '.pinmind/runs/first-run/evidence.json']; const beforeCheck = await Promise.all(canonical.map((file) => readFile(path.join(cwd, file), 'utf8')));
  const firstCheck = await main(['final', 'check', '--run', 'first-run'], cwd); const secondCheck = await main(['final', 'check', '--run', 'first-run'], cwd); assert.equal(firstCheck.verdict, 'pass'); assert.deepEqual(secondCheck, firstCheck); assert.deepEqual(await Promise.all(canonical.map((file) => readFile(path.join(cwd, file), 'utf8'))), beforeCheck); await assert.rejects(access(path.join(cwd, '.pinmind/runs/first-run/final.md')));
  const final = await main(['final', 'verify', '--run', 'first-run'], cwd); const finalText = await readFile(final.finalPath, 'utf8'); assert.equal(final.finalized, true); assert.match(finalText, /- pass: 3/); assert.match(finalText, /- uncertain: EV-004/); assert.match(finalText, /manual\/unreplayed: EV-001, EV-002, EV-003, EV-004/); assert.match(finalText, /## Remaining boundaries/); assert.match(finalText, /Host rendering requires observation/); assert.match(finalText, /Universal directory publication/); assert.match(finalText, /MUST evidence coverage: satisfied/); assert.match(finalText, /## Token usage/); assert.match(finalText, /Status: unavailable/); assert.doesNotMatch(finalText, /saved|saving|сэконом/iu); assert.doesNotMatch(finalText, /MUST verdict: pass/);
  await rejects(() => stateResume(cwd), 'NO_ACTIVE_RUN'); assert.equal((await stateShow(cwd, 'first-run')).status, 'complete'); await rejects(() => stateResume(cwd, 'first-run'), 'RUN_COMPLETE');
  await rejects(() => recordEvidence(cwd, 'first-run', evidence('EV-001', 1, 'AC-001')), 'RUN_COMPLETE');
  await rejects(() => amendContract(cwd, 'first-run', contract(2, true), 'Clarification.', ['INTENT'], 'approved'), 'RUN_COMPLETE');
  await rejects(() => validateAndSaveExecution(cwd, 'first-run', { units: [{ unitId: 'WU-001', obligations: ['REQ-001'], criteria: [], zone: ['src'] }] }), 'RUN_COMPLETE');
  const postTurn = await recordUsage(cwd, 'first-run', { status: 'actual', source: 'codex-sdk', scope: 'task', inputTokens: 10, outputTokens: 5, capturedAt: '2026-08-16T18:00:00.000Z' }); assert.equal(postTurn.totalTokens, 15);
  await initRun(cwd, 'second-run', 'User asked for behavior.');
});

test('orphan active state is diagnosed read-only and blocks resume, mutation, capture, and replacement', async () => {
  const cwd = await frozenRun();
  const activeFile = path.join(cwd, '.pinmind/active.json');
  const stateFile = path.join(cwd, '.pinmind/runs/run-one/state.json');
  const stateBefore = await readFile(stateFile, 'utf8');
  await unlink(activeFile);

  const diagnosis = await reconcileActiveRuns(cwd);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.classification, 'orphan-active');
  assert.equal(diagnosis.pointerRunId, null);
  assert.deepEqual(diagnosis.activeRunIds, ['run-one']);
  assert.equal(await readFile(stateFile, 'utf8'), stateBefore);
  await assert.rejects(access(activeFile));
  await assert.rejects(() => main(['state', 'reconcile', '--dry-run'], cwd), (error) => error.code === 'ACTIVE_RUN_INCONSISTENT' && error.details[0]?.classification === 'orphan-active');

  await rejects(() => stateResume(cwd, 'run-one'), 'ACTIVE_RUN_INCONSISTENT');
  await rejects(() => recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001')), 'ACTIVE_RUN_INCONSISTENT');
  await rejects(() => validateAndSaveExecution(cwd, 'run-one', { units: [{ unitId: 'WU-001', obligations: ['REQ-001'], criteria: [], zone: ['src'] }] }), 'ACTIVE_RUN_INCONSISTENT');
  const sentinel = path.join(cwd, 'capture-should-not-run.txt');
  await rejects(() => captureEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'orphan-capture' }), [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'bad')`]), 'ACTIVE_RUN_INCONSISTENT');
  await assert.rejects(access(sentinel));
  await rejects(() => initRun(cwd, 'second-run', 'User asked for behavior.'), 'ACTIVE_RUN_INCONSISTENT');
  await assert.rejects(access(path.join(cwd, '.pinmind/runs/second-run')));
});

test('split-brain active states block named resume, mutation, and finalization without changing bytes', async () => {
  const cwd = await frozenRun(); await recordAll(cwd); const verification = await finalVerify(cwd, 'run-one'); assert.equal(verification.ok, true);
  const donor = await workspace(); await initRun(donor, 'run-two', 'User asked for behavior.');
  await cp(path.join(donor, '.pinmind/runs/run-two'), path.join(cwd, '.pinmind/runs/run-two'), { recursive: true });
  const tracked = ['.pinmind/active.json', '.pinmind/runs/run-one/state.json', '.pinmind/runs/run-one/evidence.json', '.pinmind/runs/run-two/state.json'];
  const before = await Promise.all(tracked.map((file) => readFile(path.join(cwd, file), 'utf8')));

  const diagnosis = await reconcileActiveRuns(cwd);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.classification, 'split-brain');
  assert.equal(diagnosis.pointerRunId, 'run-one');
  assert.deepEqual(diagnosis.activeRunIds, ['run-one', 'run-two']);
  await rejects(() => stateResume(cwd, 'run-one'), 'ACTIVE_RUN_INCONSISTENT');
  await rejects(() => stateResume(cwd, 'run-two'), 'ACTIVE_RUN_INCONSISTENT');
  await rejects(() => recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001')), 'ACTIVE_RUN_INCONSISTENT');
  await rejects(() => finalizeRun(cwd, 'run-one', verification), 'ACTIVE_RUN_INCONSISTENT');
  const after = await Promise.all(tracked.map((file) => readFile(path.join(cwd, file), 'utf8')));
  assert.deepEqual(after, before);
  await assert.rejects(access(path.join(cwd, '.pinmind/runs/run-one/final.md')));
});

test('reconcile distinguishes clean idle, canonical active, and a pointer to a completed run', async () => {
  const cwd = await workspace();
  const idle = await main(['state', 'reconcile', '--dry-run'], cwd);
  assert.deepEqual({ ok: idle.ok, classification: idle.classification, pointerRunId: idle.pointerRunId, activeRunIds: idle.activeRunIds }, { ok: true, classification: 'clean-idle', pointerRunId: null, activeRunIds: [] });
  await initRun(cwd, 'run-one', 'User asked for behavior.');
  const canonical = await main(['state', 'reconcile', '--dry-run'], cwd);
  assert.deepEqual({ ok: canonical.ok, classification: canonical.classification, pointerRunId: canonical.pointerRunId, activeRunIds: canonical.activeRunIds }, { ok: true, classification: 'canonical-active', pointerRunId: 'run-one', activeRunIds: ['run-one'] });
  assert.equal((await stateResume(cwd, 'run-one')).resumePhase, 'understand');

  const stateFile = path.join(cwd, '.pinmind/runs/run-one/state.json');
  const state = JSON.parse(await readFile(stateFile, 'utf8')); state.status = 'complete'; state.stateSha256 = hashWithout(state, 'stateSha256'); await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const pointerBefore = await readFile(path.join(cwd, '.pinmind/active.json'), 'utf8');
  const divergent = await reconcileActiveRuns(cwd);
  assert.equal(divergent.ok, false); assert.equal(divergent.classification, 'pointer-nonactive');
  await rejects(() => initRun(cwd, 'run-two', 'User asked for behavior.'), 'ACTIVE_RUN_INCONSISTENT');
  assert.equal(await readFile(path.join(cwd, '.pinmind/active.json'), 'utf8'), pointerBefore);
});

test('reconcile reports invalid and missing pointers without repairing them', async () => {
  const invalidCwd = await workspace(); await initRun(invalidCwd, 'run-one', 'User asked for behavior.');
  const invalidPointer = path.join(invalidCwd, '.pinmind/active.json'); await writeFile(invalidPointer, '{invalid');
  const invalidBefore = await readFile(invalidPointer, 'utf8'); const invalid = await reconcileActiveRuns(invalidCwd);
  assert.equal(invalid.ok, false); assert.equal(invalid.classification, 'pointer-invalid'); assert.deepEqual(invalid.activeRunIds, ['run-one']); assert.equal(await readFile(invalidPointer, 'utf8'), invalidBefore);
  await rejects(() => initRun(invalidCwd, 'run-two', 'User asked for behavior.'), 'ACTIVE_RUN_INCONSISTENT');

  const missingCwd = await workspace(); await initRun(missingCwd, 'run-one', 'User asked for behavior.');
  const missingPointer = path.join(missingCwd, '.pinmind/active.json'); const missingValue = `${JSON.stringify({ format: 1, runId: 'missing-run' }, null, 2)}\n`; await writeFile(missingPointer, missingValue);
  const missing = await reconcileActiveRuns(missingCwd);
  assert.equal(missing.ok, false); assert.equal(missing.classification, 'pointer-missing-run'); assert.deepEqual(missing.activeRunIds, ['run-one']); assert.equal(await readFile(missingPointer, 'utf8'), missingValue);
  await rejects(() => stateResume(missingCwd, 'run-one'), 'ACTIVE_RUN_INCONSISTENT');
  await rejects(() => main(['state', 'reconcile'], missingCwd), 'DRY_RUN_REQUIRED');
});

test('transition recovery survives 100 seeded interruptions for every bounded lifecycle mutation', { timeout: 180000 }, async () => {
  const freezeDonor = await workspace(); await initRun(freezeDonor, 'run-one', 'User asked for behavior.'); await recordTestBaseline(freezeDonor);
  const amendDonor = await frozenRun(); await recordEvidence(amendDonor, 'run-one', evidence('EV-001', 1, 'AC-001'));
  const evidenceDonor = await frozenRun();
  const finalizeDonor = await frozenRun(); await recordAll(finalizeDonor); const verification = await finalVerify(finalizeDonor, 'run-one'); assert.equal(verification.ok, true);

  await seededTrials(100, 10, async (seed) => {
    const cwd = await workspace();
    await recoverInjectedTransition(cwd, (options) => initRun(cwd, 'run-one', 'User asked for behavior.', options), seed % 6);
    const state = (await loadState(cwd, 'run-one')).state; assert.equal(state.status, 'active'); assert.equal((await reconcileActiveRuns(cwd)).classification, 'canonical-active');
  });
  await seededTrials(100, 10, async (seed) => {
    const cwd = await clonePinmindWorkspace(freezeDonor);
    await recoverInjectedTransition(cwd, (options) => freezeContract(cwd, 'run-one', contract(), options), seed % 3);
    const state = (await loadState(cwd, 'run-one')).state; assert.equal(state.currentContractVersion, 1); assert.equal(state.phase, 'execute');
  });
  await seededTrials(100, 10, async (seed) => {
    const cwd = await clonePinmindWorkspace(amendDonor);
    await recoverInjectedTransition(cwd, (options) => amendContract(cwd, 'run-one', contract(2, true), 'Clarification.', ['INTENT'], 'approved', options), seed % 5);
    const state = (await loadState(cwd, 'run-one')).state; assert.equal(state.currentContractVersion, 2);
    const store = JSON.parse(await readFile(path.join(cwd, '.pinmind/runs/run-one/evidence.json'), 'utf8')); assert.equal(store.entries[0].status, 'invalidated');
  });
  await seededTrials(100, 10, async (seed) => {
    const cwd = await clonePinmindWorkspace(evidenceDonor);
    await recoverInjectedTransition(cwd, (options) => recordEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001'), options), seed % 2);
    const store = JSON.parse(await readFile(path.join(cwd, '.pinmind/runs/run-one/evidence.json'), 'utf8')); assert.deepEqual(store.entries.map((entry) => entry.evidenceId), ['EV-001']);
  });
  await seededTrials(100, 10, async (seed) => {
    const cwd = await clonePinmindWorkspace(finalizeDonor);
    await unlink(path.join(cwd, '.pinmind/runs/run-one/usage.json'));
    await recoverInjectedTransition(cwd, (options) => finalizeRun(cwd, 'run-one', verification, options), seed % 5);
    const state = (await loadState(cwd, 'run-one')).state; assert.equal(state.status, 'complete'); assert.equal((await reconcileActiveRuns(cwd)).classification, 'clean-idle');
    await access(path.join(cwd, '.pinmind/runs/run-one/final.md')); await access(path.join(cwd, '.pinmind/runs/run-one/usage.json')); await assert.rejects(access(path.join(cwd, '.pinmind/active.json')));
  });
});

test('SIGKILL restart requires exact stale-lock and transition hashes before recovery', { skip: process.platform === 'win32', timeout: 20000 }, async () => {
  const cwd = await workspace(); const marker = path.join(cwd, 'prepared.marker');
  const coreUrl = new URL('../skills/pinmind/scripts/lib/core.mjs', import.meta.url).href;
  const script = `import { writeFile } from 'node:fs/promises'; import { initRun } from ${JSON.stringify(coreUrl)}; await initRun(${JSON.stringify(cwd)}, 'run-one', 'User asked for behavior.', { onTransitionStep: async (step) => { if (step === 1) { await writeFile(${JSON.stringify(marker)}, 'ready'); await new Promise(() => { setInterval(() => {}, 1000); }); } } });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  await waitForFile(marker); const closed = new Promise((resolve) => child.once('close', resolve)); assert.equal(child.kill('SIGKILL'), true); await closed;
  assert.equal(stderr, '');

  const diagnosis = await reconcileActiveRuns(cwd); assert.equal(diagnosis.classification, 'transition-recovery-required'); assert.equal(diagnosis.writerLock.status, 'stale-local');
  await rejects(() => recoverTransition(cwd, diagnosis.pendingTransition.transitionSha256), 'LOCK_STALE_NEEDS_RECOVERY');
  const lockBefore = await readFile(path.join(cwd, '.pinmind/writer.lock'), 'utf8'); const journalBefore = await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8');
  await rejects(() => recoverTransition(cwd, '0'.repeat(64), { expectedLockSha256: diagnosis.writerLock.lockSha256 }), 'TRANSITION_HASH_MISMATCH');
  assert.equal(await readFile(path.join(cwd, '.pinmind/writer.lock'), 'utf8'), lockBefore); assert.equal(await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8'), journalBefore);
  await rejects(() => recoverTransition(cwd, diagnosis.pendingTransition.transitionSha256, { expectedLockSha256: '0'.repeat(64) }), 'LOCK_HASH_MISMATCH');
  const recovered = await main(['state', 'recover', '--apply', '--expected-sha256', diagnosis.pendingTransition.transitionSha256, '--expected-lock-sha256', diagnosis.writerLock.lockSha256], cwd);
  assert.equal(recovered.recovered, true); assert.equal((await reconcileActiveRuns(cwd)).classification, 'canonical-active'); await assert.rejects(access(path.join(cwd, '.pinmind/writer.lock')));
});

test('transition reconciliation and recovery fail closed on conflict and require explicit CLI authority', async () => {
  const cwd = await workspace();
  await rejects(() => initRun(cwd, 'run-one', 'User asked for behavior.', { faultAfterStep: 1 }), 'INJECTED_TRANSITION_CRASH');
  const journal = await readPendingTransition(cwd); const stateTarget = journal.actions.find((action) => action.path.endsWith('/state.json')); assert.ok(stateTarget);
  const stateFile = path.join(cwd, stateTarget.path); await writeFile(stateFile, 'unexpected-state');
  const beforeJournal = await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8'); const beforeState = await readFile(stateFile, 'utf8');
  const diagnosis = await reconcileActiveRuns(cwd); assert.equal(diagnosis.classification, 'transition-conflict');
  await rejects(() => recoverTransition(cwd, journal.transitionSha256), 'TRANSITION_CONFLICT');
  assert.equal(await readFile(path.join(cwd, '.pinmind/transition.json'), 'utf8'), beforeJournal); assert.equal(await readFile(stateFile, 'utf8'), beforeState);
  await rejects(() => main(['state', 'recover', '--expected-sha256', journal.transitionSha256], cwd), 'APPLY_REQUIRED');

  const linkedCwd = await workspace(); await rejects(() => initRun(linkedCwd, 'run-one', 'User asked for behavior.', { faultAfterStep: 0 }), 'INJECTED_TRANSITION_CRASH');
  const outside = await workspace(); await symlink(outside, path.join(linkedCwd, '.pinmind/runs'), process.platform === 'win32' ? 'junction' : 'dir');
  const linkedJournal = await readPendingTransition(linkedCwd); assert.equal((await reconcileActiveRuns(linkedCwd)).classification, 'transition-conflict');
  await rejects(() => recoverTransition(linkedCwd, linkedJournal.transitionSha256), 'TRANSITION_CONFLICT'); assert.deepEqual(await readdir(outside), []);
});

test('capture transition recovery commits evidence without replaying the captured command', async () => {
  const cwd = await frozenRun(); const sentinel = path.join(cwd, 'capture-count.txt');
  const template = evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'transition-capture' });
  await rejects(() => captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', "require('node:fs').appendFileSync(process.argv[1], 'x')", sentinel], '.', { faultAfterStep: 0 }), 'INJECTED_TRANSITION_CRASH');
  assert.equal(await readFile(sentinel, 'utf8'), 'x'); const diagnosis = await reconcileActiveRuns(cwd);
  const recovered = await main(['state', 'recover', '--apply', '--expected-sha256', diagnosis.pendingTransition.transitionSha256], cwd); assert.equal(recovered.recovered, true);
  assert.equal(await readFile(sentinel, 'utf8'), 'x'); const store = JSON.parse(await readFile(path.join(cwd, '.pinmind/runs/run-one/evidence.json'), 'utf8')); assert.equal(store.entries[0].provenance.kind, 'captured-command');
});

test('workspace writer lock permits exactly one concurrent active-run initialization', async () => {
  const cwd = await workspace();
  const results = await Promise.allSettled([
    initRun(cwd, 'race-one', 'User asked for behavior.'),
    initRun(cwd, 'race-two', 'User asked for behavior.'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected?.reason instanceof KernelError);
  assert.match(rejected.reason.code, /^(ACTIVE_RUN_EXISTS|LOCK_HELD)$/);
  const active = JSON.parse(await readFile(path.join(cwd, '.pinmind/active.json'), 'utf8'));
  const runDirectories = await readdir(path.join(cwd, '.pinmind/runs'));
  assert.deepEqual(runDirectories, [active.runId]);
});

test('workspace writer lock preserves concurrent evidence appends', async () => {
  const cwd = await frozenRun();
  const records = [evidence('EV-001', 1, 'AC-001'), evidence('EV-002', 1, 'INV-001')];
  await Promise.all(records.map((record) => recordEvidence(cwd, 'run-one', record)));
  const store = JSON.parse(await readFile(path.join(cwd, '.pinmind/runs/run-one/evidence.json'), 'utf8'));
  assert.deepEqual(store.entries.map((entry) => entry.evidenceId).sort(), ['EV-001', 'EV-002']);
});

test('workspace writer lock serializes contract freeze and fails closed for a dead owner', async () => {
  const cwd = await workspace(); await mkdir(path.join(cwd, '.pinmind'), { recursive: true });
  const lockFile = path.join(cwd, '.pinmind/writer.lock');
  const stale = { format: 1, ownerId: 'dead-owner', pid: 99999999, hostname: hostname(), operation: 'crashed', startedAt: '2026-08-16T00:00:00.000Z' };
  await writeFile(lockFile, JSON.stringify(stale));
  const blocked = await Promise.allSettled([
    initRun(cwd, 'race-one', 'User asked for behavior.'),
    initRun(cwd, 'race-two', 'User asked for behavior.'),
  ]);
  assert.equal(blocked.filter((result) => result.status === 'fulfilled').length, 0);
  for (const result of blocked) assert.equal(result.reason?.code, 'LOCK_STALE_NEEDS_RECOVERY');
  assert.deepEqual(JSON.parse(await readFile(lockFile, 'utf8')), stale);
  await assert.rejects(access(path.join(cwd, '.pinmind/runs')));

  await unlink(lockFile); await initRun(cwd, 'run-one', 'User asked for behavior.'); await recordTestBaseline(cwd);
  const results = await Promise.allSettled([freezeContract(cwd, 'run-one', contract()), freezeContract(cwd, 'run-one', contract())]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected'); assert.equal(rejected?.reason?.code, 'AMEND_REQUIRED');
  const state = (await loadState(cwd, 'run-one')).state; assert.equal(state.currentContractVersion, 1); assert.equal(Object.keys(state.contractHashes).length, 1);
});

test('workspace writer lock rejects stale concurrent usage and execution replacements', async () => {
  const usageCwd = await frozenRun();
  const initialUsage = JSON.parse(await readFile(path.join(usageCwd, '.pinmind/runs/run-one/usage.json'), 'utf8'));
  const usageRecords = [
    { status: 'actual', source: 'codex-sdk', scope: 'task', inputTokens: 10, outputTokens: 2, capturedAt: '2026-08-16T18:00:00.000Z' },
    { status: 'actual', source: 'codex-sdk', scope: 'task', inputTokens: 20, outputTokens: 3, capturedAt: '2026-08-16T18:00:01.000Z' },
  ];
  const usageResults = await Promise.allSettled(usageRecords.map((record) => recordUsage(usageCwd, 'run-one', record, { expectedUsageSha256: initialUsage.usageSha256 })));
  assert.equal(usageResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(usageResults.find((result) => result.status === 'rejected')?.reason?.code, 'STALE_USAGE');
  const storedUsage = JSON.parse(await readFile(path.join(usageCwd, '.pinmind/runs/run-one/usage.json'), 'utf8'));
  assert.ok([12, 23].includes(storedUsage.totalTokens));

  const executionCwd = await frozenRun();
  const executions = [
    { units: [{ unitId: 'WU-001', obligations: ['REQ-001'], criteria: [], zone: ['src/a'] }] },
    { units: [{ unitId: 'WU-002', obligations: ['REQ-001'], criteria: [], zone: ['src/b'] }] },
  ];
  const executionResults = await Promise.allSettled(executions.map((execution) => validateAndSaveExecution(executionCwd, 'run-one', execution, { expectedExecutionSha256: null })));
  assert.equal(executionResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(executionResults.find((result) => result.status === 'rejected')?.reason?.code, 'STALE_EXECUTION');
  const storedExecution = JSON.parse(await readFile(path.join(executionCwd, '.pinmind/runs/run-one/execution.json'), 'utf8'));
  assert.ok(['WU-001', 'WU-002'].includes(storedExecution.units[0].unitId));
});

test('workspace writer lock permits exactly one concurrent final-state commit', async () => {
  const cwd = await frozenRun(); await recordAll(cwd); const verification = await finalVerify(cwd, 'run-one'); assert.equal(verification.ok, true);
  const results = await Promise.allSettled([finalizeRun(cwd, 'run-one', verification), finalizeRun(cwd, 'run-one', verification)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected')?.reason?.code, 'RUN_COMPLETE');
  assert.equal((await stateShow(cwd, 'run-one')).status, 'complete');
  await assert.rejects(access(path.join(cwd, '.pinmind/active.json')));
});

test('capture rejects physical cwd and artifact escapes while allowing internal symlinks', async () => {
  const cwd = await frozenRun(); const outside = await workspace();
  const directoryLink = path.join(cwd, 'outside-dir');
  await symlink(outside, directoryLink, process.platform === 'win32' ? 'junction' : 'dir');
  const template = evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'trace-capture-cwd' });
  await rejects(() => captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', "require('node:fs').writeFileSync('escaped.txt', 'bad')"], 'outside-dir'), 'UNSAFE_PATH');
  await assert.rejects(access(path.join(outside, 'escaped.txt')));

  const outsideArtifact = path.join(outside, 'artifact.txt'); await writeFile(outsideArtifact, 'outside');
  await symlink(outside, path.join(cwd, 'outside-artifact-dir'), process.platform === 'win32' ? 'junction' : 'dir');
  const artifactTemplate = evidence('EV-001', 1, 'AC-001', { artifact: 'outside-artifact-dir/artifact.txt' });
  await rejects(() => captureEvidence(cwd, 'run-one', artifactTemplate, [process.execPath, '-e', 'process.exit(0)']), 'UNSAFE_PATH');

  const internal = path.join(cwd, 'internal'); await mkdir(internal); await symlink(internal, path.join(cwd, 'internal-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const captured = await captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', 'process.exit(0)'], 'internal-link');
  assert.equal(captured.status, 'pass'); assert.equal(captured.provenance.cwd, 'internal-link');
});

test('capture timeout fails honestly and terminates the controlled descendant tree', async () => {
  const cwd = await frozenRun(); const sentinel = path.join(cwd, 'late-child.txt');
  const grandchild = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'late'), 350)`;
  const parent = `const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' }); setTimeout(() => process.exit(0), 700);`;
  const template = evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'trace-timeout' });
  const started = Date.now();
  const captured = await captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', parent], '.', { timeoutMs: 100, terminationGraceMs: 50 });
  assert.equal(captured.status, 'fail'); assert.equal(captured.provenance.timedOut, true); assert.equal(captured.provenance.timeoutMs, 100); assert.ok(Date.now() - started < 1200);
  assert.match(captured.provenance.termination.scope, /^(original-process-group|taskkill-reported-tree)$/);
  assert.equal(captured.provenance.termination.detachedDescendantsCovered, false);
  assert.equal(typeof captured.provenance.termination.observation, 'string');
  await delay(450); await assert.rejects(access(sentinel));
});

test('timeout provenance does not claim detached POSIX descendants are covered', { skip: process.platform === 'win32' }, async () => {
  const cwd = await frozenRun(); const sentinel = path.join(cwd, 'detached-child.txt');
  const grandchild = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'detached'), 300)`;
  const parent = `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { detached: true, stdio: 'ignore' }); child.unref(); setTimeout(() => {}, 1000);`;
  const captured = await captureEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'trace-detached-timeout' }), [process.execPath, '-e', parent], '.', { timeoutMs: 100, terminationGraceMs: 50 });
  assert.equal(captured.status, 'fail'); assert.equal(captured.provenance.termination.scope, 'original-process-group'); assert.equal(captured.provenance.termination.detachedDescendantsCovered, false);
  await delay(350); await access(sentinel);
});

test('capture rejects a stale contract snapshot and finalization repeats verification under lock', async () => {
  const cwd = await frozenRun(); const template = evidence('EV-001', 1, 'AC-001', { artifact: undefined, reference: 'trace-stale-capture' });
  const capture = captureEvidence(cwd, 'run-one', template, [process.execPath, '-e', 'setTimeout(() => process.exit(0), 150)']);
  await delay(30); await amendContract(cwd, 'run-one', contract(2, true), 'Clarification.', ['INTENT'], 'approved');
  await rejects(() => capture, 'STALE_CAPTURE');

  const finalCwd = await frozenRun(); await recordAll(finalCwd); const verified = await finalVerify(finalCwd, 'run-one'); assert.equal(verified.ok, true);
  await amendContract(finalCwd, 'run-one', contract(2, true), 'Clarification.', ['INTENT'], 'approved');
  await rejects(() => finalizeRun(finalCwd, 'run-one', verified), 'FINAL_GATE_FAILED');
});

test('final verification rejects an artifact symlink swapped outside after capture', async () => {
  const cwd = await frozenRun(); const outside = await workspace();
  const internalDirectory = path.join(cwd, 'inside'); const externalDirectory = path.join(outside, 'escaped'); await mkdir(internalDirectory); await mkdir(externalDirectory);
  await writeFile(path.join(internalDirectory, 'artifact.txt'), 'same bytes'); await writeFile(path.join(externalDirectory, 'artifact.txt'), 'same bytes');
  const alias = path.join(cwd, 'artifact-link'); await symlink(internalDirectory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await captureEvidence(cwd, 'run-one', evidence('EV-001', 1, 'AC-001', { artifact: 'artifact-link/artifact.txt' }), [process.execPath, '-e', 'process.exit(0)']);
  await recordEvidence(cwd, 'run-one', evidence('EV-002', 1, 'INV-001')); await recordEvidence(cwd, 'run-one', evidence('EV-003', 1, 'PRES-001'));
  await unlink(alias); await symlink(externalDirectory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const result = await finalVerify(cwd, 'run-one'); assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /AC-001 lacks trustworthy passing evidence/);
});

test('activation corpus and instructions require the deterministic post-activation router lifecycle', async () => {
  const skill = await readFile(fileURLToPath(new URL('../skills/pinmind/SKILL.md', import.meta.url)), 'utf8');
  const hostSmoke = await readFile(fileURLToPath(new URL('../skills/pinmind/references/host-smoke.md', import.meta.url)), 'utf8');
  const corpus = JSON.parse(await readFile(fileURLToPath(new URL('../evals/fixtures/activation-smoke.json', import.meta.url)), 'utf8'));
  assert.match(skill, /kernel router|pinmind\.mjs route/iu); assert.match(skill, /before.*(?:tools|writes)|до.*(?:инструмент|изменен)/iu); assert.match(skill, /non-deterministic|недетерминирован/iu);
  const mandatoryRoute = skill.indexOf('## Mandatory first action'); const proportionalRouting = skill.indexOf('## Route proportionally');
  assert.ok(mandatoryRoute > 0 && mandatoryRoute < proportionalRouting); assert.match(skill.slice(mandatoryRoute, proportionalRouting), /before.*progress update[\s\S]*before.*(?:reference|workspace)/iu);
  assert.match(skill.slice(mandatoryRoute, proportionalRouting), /\{\s*"text"\s*:\s*"<full sanitized user request>"\s*\}/i);
  assert.match(skill, /(?:if|when) (?:the )?route(?: is| returns?) `?simple`?[\s\S]{0,180}(?:without|no) (?:further )?(?:reference|workspace)/iu);
  for (const field of ['caseId', 'hostVersion', 'pluginVersion', 'observedAt', 'freshSession', 'selection', 'observedRoute', 'routeBeforeTaskTools']) assert.match(hostSmoke, new RegExp(field));
  assert.match(hostSmoke, /new ChatGPT chat|new Codex .* thread/i); assert.match(hostSmoke, /does not claim|does not prove|не доказы/iu);
  assert.equal(corpus.schemaVersion, 1); assert.ok(Array.isArray(corpus.cases));
  const ids = new Set(); const counts = { ru: 0, en: 0, mixed: 0, negative: 0, conflict: 0 }; const routes = new Set();
  for (const item of corpus.cases) {
    assert.match(item.id, /^[a-z0-9][a-z0-9-]+$/); assert.equal(ids.has(item.id), false, item.id); ids.add(item.id);
    assert.match(item.locale, /^(ru|en|mixed)$/); assert.match(item.class, /^(positive|negative|conflict|explicit)$/); assert.equal(typeof item.prompt, 'string'); assert.equal(typeof item.expect?.implicitEligible, 'boolean');
    counts[item.locale] += 1; if (item.class === 'negative') counts.negative += 1; if (item.class === 'conflict') counts.conflict += 1;
    if (item.class === 'negative') assert.equal(item.expect.implicitEligible, false, item.id); else assert.equal(item.expect.implicitEligible, true, item.id);
    const routed = routeTask({ text: item.prompt });
    for (const field of ['route', 'clarity', 'executionSpan', 'risk']) assert.equal(routed[field], item.expect[field], `${item.id}:${field}`);
    if (item.expect.needsHumanConfirmation !== undefined) assert.equal(routed.needsHumanConfirmation, item.expect.needsHumanConfirmation, `${item.id}:confirmation`);
    if (item.class === 'conflict') { assert.equal(routed.route, 'audit', item.id); assert.equal(routed.needsHumanConfirmation, true, item.id); }
    routes.add(routed.route);
  }
  assert.ok(counts.ru >= 6); assert.ok(counts.en >= 6); assert.ok(counts.mixed >= 4); assert.ok(counts.negative >= 6); assert.ok(counts.conflict >= 2);
  assert.deepEqual([...routes].sort(), ['audit', 'investigation', 'operational', 'simple', 'software-change', 'spike']);
  const release = routeTask({ text: 'Доделай Pinmind: исправь гонки всех канонических изменений, symlink containment, timeout process groups, router lifecycle и host smoke corpus.' });
  assert.equal(release.route, 'software-change'); assert.equal(release.risk, 'high'); assert.equal(release.executionSpan, 'cross-cutting');
});

test('progressive references preserve composition, diagnosis, handoff, and regression boundaries', async () => {
  const route = await readFile(fileURLToPath(new URL('../skills/pinmind/references/route.md', import.meta.url)), 'utf8');
  const execution = await readFile(fileURLToPath(new URL('../skills/pinmind/references/execution.md', import.meta.url)), 'utf8');
  const inbox = await readFile(fileURLToPath(new URL('../skills/pinmind/references/regression-inbox.md', import.meta.url)), 'utf8');
  assert.match(route, /Composition after routing/i); for (const kind of ['simple', 'operational', 'spike', 'audit', 'investigation', 'software-change']) assert.ok(route.includes(`| \`${kind}\` |`), kind);
  assert.match(execution, /Investigation feedback loop/i); assert.match(execution, /public-seam test[\s\S]*CLI.API.browser[\s\S]*minimal (?:throwaway )?harness[\s\S]*(?:property|fuzz)[\s\S]*(?:bisect|differential)/i);
  assert.match(execution, /Phase boundar/i); for (const action of ['continue', 'compact', 'handoff', 'subagent']) assert.ok(execution.includes(`\`${action}\``), action);
  assert.match(inbox, /regression case.*before|before.*policy change/is); assert.match(inbox, /activation-miss/); assert.match(inbox, /route-misclassification/); assert.match(inbox, /Do not automatically rewrite Pinmind/i);
});

test('CLI evidence gate throws, final check returns a failed verdict, and empty input provides usage', async () => {
  const cwd = await frozenRun(); const file = path.join(cwd, '.pinmind/runs/run-one/evidence.json'); const store = { format: 1, entries: [evidence('EV-999', 1, 'AC-001')] }; store.storeSha256 = hashWithout(store, 'storeSha256'); await writeFile(file, JSON.stringify(store));
  await rejects(() => main(['evidence', 'validate', '--run', 'run-one'], cwd), 'EVIDENCE_GATE_FAILED'); assert.equal((await main(['final', 'check', '--run', 'run-one'], cwd)).verdict, 'fail'); assert.match((await main([], cwd)).usage, /Usage:/);
});
