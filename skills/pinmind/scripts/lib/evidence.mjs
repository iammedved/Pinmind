import { spawn } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  FORMAT, KernelError, canonicalJson, currentContract, executeTransition, existingEntry, exists, hashWithout, ids, isPhysicalDescendant,
  jsonText, readJson, redact, redactArgv, redactValue, requireCanonicalActiveRun, safeRelativePath, safeRunId,
  sha256, sleep, validEvidenceId, verifyRun, verifiedLayout, withWorkspaceLock, writeJsonAtomic,
} from './persist.mjs';

const EVIDENCE_STATUSES = new Set(['pass', 'fail', 'uncertain', 'pending-review', 'not-applicable', 'invalidated']);
const EVIDENCE_TYPES = new Set(['unit-test', 'integration-test', 'end-to-end-test', 'property-test', 'static-typecheck', 'lint-static-analysis', 'browser-journey', 'screenshot-reference-comparison', 'accessibility-check', 'benchmark', 'migration-dry-run', 'log-trace-observation', 'manual-pending-review', 'external-service-proof']);
const CAPTURE_TIMEOUT_MS = 30000;
const CAPTURE_TIMEOUT_MIN_MS = 50;
const CAPTURE_TIMEOUT_MAX_MS = 300000;
const CAPTURE_TERMINATION_GRACE_MS = 250;
export function allTargetIds(contract) { return new Set([...ids(contract.acceptanceCriteria), ...ids(contract.invariants), ...ids(contract.preservation)]); }
function plannedEvidence(contract) { return new Set([...(contract.acceptanceCriteria || []), ...(contract.invariants || []), ...(contract.preservation || [])].flatMap((item) => item.evidence || [])); }

export function evidenceStoreHash(store) { return hashWithout(store, 'storeSha256'); }
export async function loadEvidence(files) {
  const store = await readJson(files.evidence, 'Evidence store');
  if (store.format !== FORMAT || !Array.isArray(store.entries) || typeof store.storeSha256 !== 'string' || evidenceStoreHash(store) !== store.storeSha256) {
    throw new KernelError('Evidence store is corrupt.', 'CORRUPT_EVIDENCE');
  }
  return store;
}
export function nonEmptyText(value) { return typeof value === 'string' && value.trim().length > 0; }

function evidenceEntryErrors(entry, contract, version) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || !validEvidenceId(entry.evidenceId)) errors.push('evidenceId must use the EV-NNN prefix.');
  if (entry.contractVersion !== version) errors.push('Evidence must use the current contract version.');
  if (!Array.isArray(entry.covers) || entry.covers.length === 0 || !entry.covers.every((id) => allTargetIds(contract).has(id))) errors.push('Evidence covers unknown criteria.');
  if (!EVIDENCE_STATUSES.has(entry.status) || entry.status === 'invalidated') errors.push('Evidence status is invalid.');
  if (!EVIDENCE_TYPES.has(entry.type)) errors.push('Evidence type is invalid.');
  if (!nonEmptyText(entry.command) && !nonEmptyText(entry.procedure)) errors.push('Evidence needs a nonempty command or procedure.');
  if (!nonEmptyText(entry.observed)) errors.push('Evidence needs a nonempty observed result.');
  if (entry.status === 'pass' && !nonEmptyText(entry.artifact) && !nonEmptyText(entry.reference)) errors.push('Passing evidence needs an artifact or reference.');
  const criticalTargets = new Set([...(contract.acceptanceCriteria || []), ...(contract.invariants || []), ...(contract.preservation || [])].filter((item) => item.critical).map((item) => item.id));
  if (entry.status === 'pass' && (entry.covers || []).some((id) => criticalTargets.has(id)) && (!nonEmptyText(entry.sensitivity?.method) || !nonEmptyText(entry.sensitivity?.observed))) errors.push('Passing evidence for a critical target needs sensitivity.method and sensitivity.observed.');
  if (!plannedEvidence(contract).has(entry.evidenceId)) errors.push('Evidence id is not planned by the frozen contract.');
  if (entry.provenance?.kind === 'manual-attestation' && nonEmptyText(entry.command)) errors.push('Manual-attestation evidence must not contain a command.');
  if (entry.provenance && !['manual-attestation', 'captured-command'].includes(entry.provenance.kind)) errors.push('Evidence provenance kind is invalid.');
  return errors;
}

async function recordEvidenceUnlocked(cwd, runId, record, { allowCaptured = false, expectedSnapshot, transitionOptions = {} } = {}) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state);
  await requireCanonicalActiveRun(cwd, state, runId);
  if (expectedSnapshot && (state.stateSha256 !== expectedSnapshot.stateSha256 || state.currentContractVersion !== expectedSnapshot.contractVersion || contract.contractSha256 !== expectedSnapshot.contractSha256)) {
    throw new KernelError('The run changed while evidence was being captured.', 'STALE_CAPTURE');
  }
  const entry = redactValue(structuredClone(record)); const errors = evidenceEntryErrors(entry, contract, state.currentContractVersion);
  if (entry.provenance?.kind === 'captured-command' && !allowCaptured) errors.push('Captured-command provenance may only be written by evidence capture.');
  if (errors.length) throw new KernelError('Evidence validation failed.', 'INVALID_EVIDENCE', errors);
  entry.verifiedAt = entry.verifiedAt || new Date().toISOString();
  const evidence = await loadEvidence(files);
  // Evidence is historical: a new version may intentionally reuse EV-001.
  evidence.entries = (evidence.entries || []).filter((item) => item.evidenceId !== entry.evidenceId || item.contractVersion !== entry.contractVersion);
  evidence.entries.push(entry);
  evidence.storeSha256 = evidenceStoreHash(evidence);
  await executeTransition(cwd, 'evidence', runId, [{ file: files.evidence, content: jsonText(evidence) }], transitionOptions); return entry;
}

export async function recordEvidence(cwd, runId, record, options = {}) {
  return withWorkspaceLock(cwd, `record-evidence:${safeRunId(runId)}`, () => recordEvidenceUnlocked(cwd, runId, record, { transitionOptions: options }));
}

function captureOutput(stream, limit = 65536) {
  let settled = false; let storedBytes = 0; let truncated = false; const chunks = []; let settle;
  const promise = new Promise((resolve) => { settle = (incomplete = false) => {
    if (settled) return; settled = true;
    resolve({ value: redact(Buffer.concat(chunks).toString('utf8')), truncated, incomplete });
  }; });
  stream.on('data', (chunk) => {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = Math.max(0, limit - storedBytes);
    if (remaining > 0) { const kept = value.subarray(0, remaining); chunks.push(kept); storedBytes += kept.length; }
    if (value.length > remaining) truncated = true;
  });
  stream.once('end', () => settle(false)); stream.once('close', () => { if (stream.readableEnded) settle(false); }); stream.once('error', () => settle(true));
  return { promise, force: () => { settle(true); stream.destroy(); } };
}

export async function resolveContainedExisting(cwd, requested, label, kind) {
  const relative = safeRelativePath(requested, label); let rootReal; let candidateReal;
  try { rootReal = await realpath(path.resolve(cwd)); }
  catch (error) { throw new KernelError(`Workspace path is unreadable: ${cwd}`, 'UNSAFE_PATH', [error.message]); }
  try { candidateReal = await realpath(path.resolve(rootReal, relative)); }
  catch (error) {
    const code = kind === 'directory' ? 'CAPTURE_CWD_INVALID' : 'CAPTURE_ARTIFACT_MISSING';
    throw new KernelError(`${label} is missing or unreadable: ${relative}`, code, [error.message]);
  }
  if (!isPhysicalDescendant(rootReal, candidateReal)) throw new KernelError(`${label} escapes the physical workspace.`, 'UNSAFE_PATH');
  const information = await stat(candidateReal);
  if (kind === 'directory' && !information.isDirectory()) throw new KernelError(`${label} must resolve to a directory.`, 'CAPTURE_CWD_INVALID');
  if (kind === 'file' && !information.isFile()) throw new KernelError(`${label} must resolve to a regular file.`, 'CAPTURE_ARTIFACT_MISSING');
  return { relative, absolute: candidateReal };
}

async function artifactHashes(cwd, entry, { required = true } = {}) {
  if (!nonEmptyText(entry.artifact)) return {};
  try {
    const artifact = await resolveContainedExisting(cwd, entry.artifact, 'artifact', 'file');
    return { [artifact.relative]: sha256(await readFile(artifact.absolute)) };
  } catch (error) {
    if (!required && error.code === 'CAPTURE_ARTIFACT_MISSING') return {};
    throw error;
  }
}

function declaredFreshnessPaths(value, fallback = []) {
  const input = value === undefined ? fallback : value;
  if (!Array.isArray(input) || input.length > 64) throw new KernelError('freshnessPaths must contain at most 64 relative file paths.', 'INVALID_FRESHNESS_SCOPE');
  const paths = [...new Set(input.map((item) => safeRelativePath(item, 'freshness path')))];
  if (paths.length !== input.length) throw new KernelError('freshnessPaths must be unique.', 'INVALID_FRESHNESS_SCOPE');
  return paths;
}
async function gitHeadForFingerprint(cwd) {
  return new Promise((resolve) => {
    let output = ''; let settled = false;
    const child = spawn('git', ['-C', cwd, 'rev-parse', 'HEAD'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => { child.kill(); finish(null); }, 2000);
    child.stdout.on('data', (chunk) => { if (output.length < 256) output += chunk.toString('utf8'); });
    child.once('error', () => { clearTimeout(timer); finish(null); });
    child.once('close', (code) => { clearTimeout(timer); const head = output.trim(); finish(code === 0 && /^[a-f0-9]{40,64}$/i.test(head) ? head.toLowerCase() : null); });
  });
}
async function workspaceFingerprint(cwd, requestedPaths) {
  const paths = declaredFreshnessPaths(requestedPaths);
  if (paths.length === 0) return { kind: 'unavailable', status: 'unavailable', reason: 'No bounded freshness paths were declared.', paths: [] };
  const entries = [];
  for (const relative of paths) {
    try {
      const lexical = path.resolve(cwd, relative); const lexicalEntry = await existingEntry(lexical, 'freshness path');
      if (lexicalEntry?.isSymbolicLink()) throw new KernelError('freshness path must be a physical regular file.', 'INVALID_FRESHNESS_SCOPE', [relative]);
      const file = await resolveContainedExisting(cwd, relative, 'freshness path', 'file');
      entries.push({ path: file.relative, sha256: sha256(await readFile(file.absolute)) });
    } catch (error) {
      if (error.code !== 'CAPTURE_ARTIFACT_MISSING') throw error;
      return { kind: 'unavailable', status: 'unavailable', reason: `Declared freshness path is missing: ${relative}`, paths };
    }
  }
  const gitHead = await gitHeadForFingerprint(cwd); const fingerprintSha256 = sha256(canonicalJson({ entries }));
  return { kind: gitHead ? 'git-paths-v1' : 'artifacts-v1', status: 'current', gitHead, paths, entries, fingerprintSha256 };
}
export async function assessWorkspaceFingerprint(cwd, fingerprint) {
  if (!fingerprint || fingerprint.status !== 'current' || !Array.isArray(fingerprint.paths) || typeof fingerprint.fingerprintSha256 !== 'string') return { status: 'unavailable', reason: fingerprint?.reason || 'No trustworthy workspace fingerprint was captured.' };
  const current = await workspaceFingerprint(cwd, fingerprint.paths);
  if (current.status !== 'current') return { status: 'unavailable', reason: current.reason };
  return current.fingerprintSha256 === fingerprint.fingerprintSha256
    ? { status: 'current' }
    : { status: 'stale', reason: 'One or more declared freshness paths changed after capture.' };
}

function baselineHash(receipt) { return hashWithout(receipt, 'baselineSha256'); }
export async function loadBaseline(files) {
  if (!(await exists(files.baseline))) return { format: FORMAT, status: 'unavailable', reason: 'Legacy run has no baseline receipt.', legacy: true };
  const receipt = await readJson(files.baseline, 'Baseline receipt');
  if (receipt.format !== FORMAT || !['green', 'pre-existing-failure', 'unavailable'].includes(receipt.status) || typeof receipt.baselineSha256 !== 'string' || baselineHash(receipt) !== receipt.baselineSha256) throw new KernelError('Baseline receipt is corrupt.', 'CORRUPT_BASELINE');
  return receipt;
}
async function baselinePreflight(cwd, runId) {
  const { files, state } = await verifyRun(cwd, runId); await requireCanonicalActiveRun(cwd, state, runId);
  if (await exists(files.baseline)) throw new KernelError('A baseline receipt already exists.', 'BASELINE_EXISTS');
  if (state.currentContractVersion !== null || state.phase !== 'understand') throw new KernelError('Baseline must be recorded before the contract is frozen.', 'BASELINE_TOO_LATE');
  const evidence = await loadEvidence(files);
  if ((evidence.entries || []).length > 0) throw new KernelError('Baseline must be recorded before evidence capture.', 'BASELINE_TOO_LATE');
  return { files, state };
}
export async function recordUnavailableBaseline(cwd, runId, reason) {
  if (!nonEmptyText(reason)) throw new KernelError('Unavailable baseline requires a reason.', 'INVALID_BASELINE');
  return withWorkspaceLock(cwd, `record-baseline:${safeRunId(runId)}`, async () => {
    const { files } = await baselinePreflight(cwd, runId); const receipt = { format: FORMAT, status: 'unavailable', reason: redact(reason), capturedAt: new Date().toISOString(), provenance: { kind: 'manual-attestation' } };
    receipt.baselineSha256 = baselineHash(receipt); await writeJsonAtomic(files.baseline, receipt); return receipt;
  });
}

function capturePolicy(options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? CAPTURE_TIMEOUT_MS); const terminationGraceMs = Number(options.terminationGraceMs ?? CAPTURE_TERMINATION_GRACE_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < CAPTURE_TIMEOUT_MIN_MS || timeoutMs > CAPTURE_TIMEOUT_MAX_MS) throw new KernelError(`timeoutMs must be an integer from ${CAPTURE_TIMEOUT_MIN_MS} to ${CAPTURE_TIMEOUT_MAX_MS}.`, 'INVALID_TIMEOUT');
  if (!Number.isInteger(terminationGraceMs) || terminationGraceMs < 10 || terminationGraceMs > 5000) throw new KernelError('terminationGraceMs must be an integer from 10 to 5000.', 'INVALID_TIMEOUT');
  return { timeoutMs, terminationGraceMs };
}

async function runTaskkill(pid) {
  const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { shell: false, windowsHide: true, stdio: 'ignore' });
  return Promise.race([
    new Promise((resolve) => { killer.once('error', () => resolve(false)); killer.once('close', (code) => resolve(code === 0)); }),
    sleep(2000).then(() => { killer.kill(); return false; }),
  ]);
}

async function terminateProcessTree(child, isClosed, graceMs) {
  const result = {
    method: process.platform === 'win32' ? 'taskkill-tree' : 'posix-process-group',
    scope: process.platform === 'win32' ? 'taskkill-reported-tree' : 'original-process-group',
    termSent: false,
    killSent: false,
    directChildFallback: false,
    rootExitObserved: isClosed(),
    detachedDescendantsCovered: false,
    succeeded: false,
    observation: isClosed() ? 'Root process closed before tree termination could be observed.' : 'Termination not yet attempted.',
  };
  if (!child.pid || isClosed()) return result;
  if (process.platform === 'win32') {
    result.termSent = true; result.succeeded = await runTaskkill(child.pid);
    result.rootExitObserved = isClosed();
    if (result.succeeded) result.observation = 'taskkill /T reported successful process-tree termination.';
    else if (!isClosed()) {
      result.directChildFallback = true; result.killSent = child.kill(); result.rootExitObserved = isClosed();
      result.observation = result.killSent
        ? 'taskkill /T failed; a direct-child kill was attempted, so tree cleanup is unconfirmed.'
        : 'taskkill /T failed and the direct-child fallback was not accepted; tree cleanup is unconfirmed.';
    } else result.observation = 'taskkill /T failed; the root closed, but descendant cleanup is unconfirmed.';
    return result;
  }
  try { process.kill(-child.pid, 'SIGTERM'); result.termSent = true; }
  catch (error) {
    if (error.code === 'ESRCH') {
      result.succeeded = true; result.rootExitObserved = isClosed(); result.observation = 'The original process group was already absent.'; return result;
    }
    result.observation = `SIGTERM to the original process group failed: ${error.code || 'unknown error'}.`;
  }
  await sleep(graceMs);
  let groupAbsent = false;
  try { process.kill(-child.pid, 0); }
  catch (error) { if (error.code === 'ESRCH') groupAbsent = true; }
  if (!groupAbsent) {
    try { process.kill(-child.pid, 'SIGKILL'); result.killSent = true; }
    catch (error) {
      if (error.code === 'ESRCH') groupAbsent = true;
      else { result.rootExitObserved = isClosed(); result.observation = `SIGKILL to the original process group failed: ${error.code || 'unknown error'}.`; return result; }
    }
  }
  if (!groupAbsent) {
    await sleep(Math.min(graceMs, 250));
    try { process.kill(-child.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') groupAbsent = true; }
  }
  result.rootExitObserved = isClosed(); result.succeeded = groupAbsent;
  result.observation = groupAbsent
    ? 'The original POSIX process group is absent after termination signals; detached descendants are outside this observation.'
    : 'The original POSIX process group still exists or could not be observed as absent; cleanup is unconfirmed.';
  return result;
}

async function settleCapturedOutput(capture, waitMs = 750) {
  const timed = Symbol('output-timeout'); const result = await Promise.race([capture.promise, sleep(waitMs).then(() => timed)]);
  if (result !== timed) return result; capture.force(); return capture.promise;
}

async function runCapturedCommand(argv, intendedCwd, options = {}, missingMessage = 'capture requires a command after --.') {
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((item) => typeof item === 'string' && item.length > 0)) throw new KernelError(missingMessage, 'MISSING_COMMAND');
  const policy = capturePolicy(options);
  const child = spawn(argv[0], argv.slice(1), { cwd: intendedCwd.absolute, detached: process.platform !== 'win32', shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdoutCapture = captureOutput(child.stdout); const stderrCapture = captureOutput(child.stderr); let closed = false; let timer;
  const closePromise = new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new KernelError(`Could not start capture command: ${error.message}`, 'CAPTURE_SPAWN_FAILED')));
    child.once('close', (exitCode, signal) => { closed = true; resolve({ exitCode: exitCode ?? null, signal: signal ?? null }); });
  });
  let result; let timedOut = false; let termination = { method: 'none', termSent: false, killSent: false, succeeded: true };
  try {
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), policy.timeoutMs); });
    const first = await Promise.race([closePromise.then((value) => ({ timedOut: false, value })), deadline]);
    if (!first.timedOut) result = first.value;
    else {
      timedOut = true; termination = await terminateProcessTree(child, () => closed, policy.terminationGraceMs);
      const incomplete = Symbol('close-timeout'); const closedResult = await Promise.race([closePromise, sleep(policy.terminationGraceMs + 1000).then(() => incomplete)]);
      if (closedResult === incomplete) { if (!closed) child.kill('SIGKILL'); result = { exitCode: null, signal: null }; termination.succeeded = false; }
      else result = closedResult;
    }
  } finally { if (timer) clearTimeout(timer); }
  const stdout = await settleCapturedOutput(stdoutCapture); const stderr = await settleCapturedOutput(stderrCapture); const sanitizedArgv = redactArgv(argv);
  return {
    success: !timedOut && result.exitCode === 0,
    observed: timedOut ? `Capture timed out after ${policy.timeoutMs} ms. ${termination.observation}` : `Captured exit code ${result.exitCode}.`,
    provenance: {
      kind: 'captured-command', argv: sanitizedArgv, cwd: intendedCwd.relative, exitCode: result.exitCode, signal: result.signal, timedOut, timeoutMs: policy.timeoutMs, termination,
      stdout: stdout.value, stderr: stderr.value, stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated, outputIncomplete: stdout.incomplete || stderr.incomplete,
      capturedAt: new Date().toISOString(),
    },
  };
}

export async function captureBaseline(cwd, runId, template, argv, requestedCwd = '.', options = {}) {
  const initial = await baselinePreflight(cwd, runId); const expectedStateSha256 = initial.state.stateSha256;
  const intendedCwd = await resolveContainedExisting(cwd, requestedCwd, 'baseline cwd', 'directory');
  const captured = await runCapturedCommand(argv, intendedCwd, options, 'baseline capture requires a command after --.');
  const paths = declaredFreshnessPaths(template?.freshnessPaths, []); const fingerprint = await workspaceFingerprint(cwd, paths);
  return withWorkspaceLock(cwd, `capture-baseline:${safeRunId(runId)}`, async () => {
    const { files, state } = await baselinePreflight(cwd, runId);
    if (state.stateSha256 !== expectedStateSha256) throw new KernelError('The run changed while the baseline was being captured.', 'STALE_CAPTURE');
    const receipt = {
      format: FORMAT,
      status: captured.provenance.timedOut || captured.provenance.exitCode === null ? 'unavailable' : captured.success ? 'green' : 'pre-existing-failure',
      observed: captured.observed,
      capturedAt: captured.provenance.capturedAt,
      provenance: captured.provenance,
      workspaceFingerprint: fingerprint,
    };
    if (receipt.status === 'unavailable') receipt.reason = captured.observed;
    receipt.baselineSha256 = baselineHash(receipt); await writeJsonAtomic(files.baseline, receipt); return receipt;
  });
}

export async function captureEvidence(cwd, runId, template, argv, requestedCwd = '.', options = {}) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state);
  await requireCanonicalActiveRun(cwd, state, runId);
  const expectedSnapshot = { stateSha256: state.stateSha256, contractVersion: state.currentContractVersion, contractSha256: contract.contractSha256 };
  const intendedCwd = await resolveContainedExisting(cwd, requestedCwd, 'capture cwd', 'directory'); const relativeCwd = intendedCwd.relative;
  if (nonEmptyText(template?.artifact)) {
    try { await resolveContainedExisting(cwd, template.artifact, 'artifact', 'file'); }
    catch (error) { if (error.code !== 'CAPTURE_ARTIFACT_MISSING') throw error; }
  }
  const captured = await runCapturedCommand(argv, { ...intendedCwd, relative: relativeCwd }, options, 'evidence capture requires a command after --.');
  const entry = redactValue(structuredClone(template)); const freshnessPaths = declaredFreshnessPaths(entry.freshnessPaths, nonEmptyText(entry.artifact) ? [entry.artifact] : []); delete entry.freshnessPaths;
  entry.command = captured.provenance.argv.join(' '); entry.status = captured.success ? 'pass' : 'fail'; entry.observed = captured.observed;
  entry.provenance = { ...captured.provenance, artifactHashes: await artifactHashes(cwd, entry, { required: entry.status === 'pass' }), workspaceFingerprint: await workspaceFingerprint(cwd, freshnessPaths) };
  return withWorkspaceLock(cwd, `capture-evidence:${safeRunId(runId)}`, () => recordEvidenceUnlocked(cwd, runId, entry, { allowCaptured: true, expectedSnapshot, transitionOptions: options }));
}

export async function validateEvidence(cwd, runId) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state); const evidence = await loadEvidence(files);
  const errors = []; const seen = new Set();
  for (const entry of evidence.entries || []) {
    // Older versions remain an audit trail. They cannot satisfy the current contract,
    // but an invalidated historical record is not a current validation error.
    if (!entry || entry.contractVersion !== state.currentContractVersion) continue;
    const key = `${entry.contractVersion}:${entry.evidenceId}`;
    if (seen.has(key)) errors.push('Evidence contains a duplicate evidenceId for the current contract.');
    seen.add(key);
    errors.push(...evidenceEntryErrors(entry, contract, state.currentContractVersion).map((message) => `${entry.evidenceId || 'evidence'}: ${message}`));
  }
  return { ok: errors.length === 0, errors, entries: evidence.entries || [] };
}
