import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access, rename, unlink, open, realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import path from 'node:path';

export class KernelError extends Error {
  constructor(message, code = 'KERNEL_ERROR', details = []) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
    this.details = details;
  }
}

const FORMAT = 1;
const EVIDENCE_STATUSES = new Set(['pass', 'fail', 'uncertain', 'pending-review', 'not-applicable', 'invalidated']);
const USAGE_STATUSES = new Set(['actual', 'unavailable']);
const USAGE_SOURCES = new Set(['codex-sdk', 'codex-exec-json', 'app-server', 'openai-api', 'manual-attestation', 'host-unavailable']);
const USAGE_SCOPES = new Set(['turn', 'task', 'run']);
const USAGE_FIELDS = new Set(['format', 'status', 'source', 'scope', 'model', 'inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens', 'capturedAt', 'reason', 'reference', 'usageSha256']);
const PRIORITIES = new Set(['must', 'should', 'could']);
const EVIDENCE_TYPES = new Set(['unit-test', 'integration-test', 'end-to-end-test', 'property-test', 'static-typecheck', 'lint-static-analysis', 'browser-journey', 'screenshot-reference-comparison', 'accessibility-check', 'benchmark', 'migration-dry-run', 'log-trace-observation', 'manual-pending-review', 'external-service-proof']);
const PREFIXES = { obligations: 'REQ', acceptanceCriteria: 'AC', invariants: 'INV', preservation: 'PRES', publicSeams: 'SEAM', nonFunctional: 'NFR' };
const TOP_LEVEL_TOKENS = ['INTENT', 'ACTORS', 'BOUNDARIES', 'ASSUMPTIONS', 'OUT-OF-SCOPE'];
const CONTRACT_FIELDS = new Set(['contractId', 'version', 'status', 'source', 'intent', 'actors', 'obligations', 'acceptanceCriteria', 'invariants', 'preservation', 'boundaries', 'publicSeams', 'nonFunctional', 'assumptions', 'outOfScope', 'contractSha256', 'amends']);
const LOCK_WAIT_MS = 5000;
const LOCK_RETRY_MS = 15;
const CAPTURE_TIMEOUT_MS = 30000;
const CAPTURE_TIMEOUT_MIN_MS = 50;
const CAPTURE_TIMEOUT_MAX_MS = 300000;
const CAPTURE_TERMINATION_GRACE_MS = 250;

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const canonicalJson = (value) => JSON.stringify(sortValue(value));

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  return value;
}

export function hashWithout(object, key) {
  const clone = structuredClone(object);
  delete clone[key];
  return sha256(canonicalJson(clone));
}

export function safeRunId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/i.test(value) || value.includes('..')) {
    throw new KernelError('Run id must contain only letters, digits, and hyphens.', 'UNSAFE_RUN_ID');
  }
  return value;
}

export function safeRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new KernelError(`${label} is required.`, 'UNSAFE_PATH');
  const normalized = value.replace(/\\/g, '/');
  if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized) || normalized.split('/').includes('..')) {
    throw new KernelError(`${label} must be a safe relative path.`, 'UNSAFE_PATH');
  }
  return normalized.replace(/^\.\//, '');
}

export function redact(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED]')
    .replace(/\b(Authorization\s*[:=]\s*(?:(?:Basic|Bearer)\s+)?)[^\s,'"`]+/gi, '$1[REDACTED]')
    .replace(/\b((?:Set-)?Cookie\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/\b((?:session(?:id)?|sid)\s*=\s*)[^;\s,'"`]+/gi, '$1[REDACTED]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\b(Bearer\s+)[^\s,'"`]+/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|secret|password|token)\s*[=:]\s*)[^\s,'"`]+/gi, '$1[REDACTED]');
}

export function redactValue(value, key = '') {
  if (/(password|secret|token|api[_-]?key|authorization|cookie|session|sid|set-cookie)/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v, k)]));
  return value;
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function readJson(file, label = 'JSON file') {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw new KernelError(`${label} is unreadable or invalid JSON: ${file}`, 'INVALID_JSON', [error.message]); }
}
async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temporary, file); }
  catch (error) { try { await unlink(temporary); } catch {} throw error; }
}
async function writeTextAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, value, 'utf8'); await rename(temporary, file); }
  catch (error) { try { await unlink(temporary); } catch {} throw error; }
}
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function layout(cwd, runId) {
  const safe = safeRunId(runId);
  const root = path.resolve(cwd, '.pinmind');
  const runs = path.join(root, 'runs');
  const run = path.join(runs, safe);
  return { root, runs, run, lock: path.join(root, 'writer.lock'), active: path.join(root, 'active.json'), brief: path.join(run, 'brief.md'), state: path.join(run, 'state.json'), evidence: path.join(run, 'evidence.json'), usage: path.join(run, 'usage.json'), final: path.join(run, 'final.md'), execution: path.join(run, 'execution.json'), contracts: path.join(run, 'contracts'), amendments: path.join(run, 'amendments') };
}

async function inspectExistingLock(lockFile) {
  let current;
  try { current = await readJson(lockFile, 'Writer lock'); }
  // A contender can observe the file after O_EXCL creation but before the owner
  // finishes writing metadata. Retry boundedly instead of misclassifying that
  // short initialization window as a stale lock.
  catch { return { code: 'LOCK_STALE_NEEDS_RECOVERY', terminal: false }; }
  if (current?.hostname !== hostname() || !Number.isInteger(current?.pid) || current.pid < 1 || typeof current?.ownerId !== 'string') {
    return { code: 'LOCK_STALE_NEEDS_RECOVERY', terminal: true };
  }
  try { process.kill(current.pid, 0); return { code: 'LOCK_HELD', terminal: false }; }
  catch (error) {
    if (error.code === 'ESRCH') return { code: 'LOCK_STALE_NEEDS_RECOVERY', terminal: true };
    return { code: 'LOCK_HELD', terminal: false };
  }
}

async function acquireWorkspaceLock(cwd, operation, waitMs = LOCK_WAIT_MS) {
  const root = path.resolve(cwd, '.pinmind'); const lockFile = path.join(root, 'writer.lock');
  await mkdir(root, { recursive: true });
  const ownerId = randomUUID(); const deadline = Date.now() + waitMs;
  let heldCode = 'LOCK_HELD';
  while (true) {
    try {
      const handle = await open(lockFile, 'wx', 0o600);
      const metadata = { format: FORMAT, ownerId, pid: process.pid, hostname: hostname(), operation, startedAt: new Date().toISOString() };
      let writeError;
      try { await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8'); await handle.sync(); }
      catch (error) { writeError = error; }
      finally { await handle.close(); }
      if (writeError) { try { await unlink(lockFile); } catch {} throw writeError; }
      return { lockFile, ownerId };
    } catch (error) {
      if (error.code !== 'EEXIST') throw new KernelError(`Could not acquire workspace writer lock: ${error.message}`, 'LOCK_FAILED');
      const status = await inspectExistingLock(lockFile); heldCode = status.code || heldCode;
      if (status.terminal) throw new KernelError('The Pinmind workspace writer lock needs explicit recovery.', heldCode);
      if (Date.now() >= deadline) throw new KernelError('The Pinmind workspace writer lock is held.', heldCode);
      await sleep(LOCK_RETRY_MS);
    }
  }
}

async function releaseWorkspaceLock(lock) {
  try {
    const current = await readJson(lock.lockFile, 'Writer lock');
    if (current.ownerId === lock.ownerId) await unlink(lock.lockFile);
  } catch (error) {
    if (error.code !== 'ENOENT') return;
  }
}

async function withWorkspaceLock(cwd, operation, action) {
  const lock = await acquireWorkspaceLock(cwd, operation);
  try { return await action(lock); }
  finally { await releaseWorkspaceLock(lock); }
}

function stateHash(state) { return hashWithout(state, 'stateSha256'); }
function setStateHash(state) { state.stateSha256 = stateHash(state); return state; }

export async function loadState(cwd, runId) {
  const files = layout(cwd, runId);
  const state = await readJson(files.state, 'Run state');
  if (state.format !== FORMAT || state.runId !== runId || typeof state.stateSha256 !== 'string' || stateHash(state) !== state.stateSha256) {
    throw new KernelError(`Run state is corrupt: ${runId}`, 'CORRUPT_STATE');
  }
  return { files, state };
}

async function saveState(files, state) { state.updatedAt = new Date().toISOString(); await writeJsonAtomic(files.state, setStateHash(state)); }
function requireActiveRun(state, runId) { if (state.status !== 'active') throw new KernelError(`Run ${runId} is complete.`, 'RUN_COMPLETE'); }

function ids(items) { return new Set((items || []).map((item) => item.id)); }
function requireArray(value, label, errors) { if (!Array.isArray(value)) errors.push(`${label} must be an array.`); }
function validId(value) { return typeof value === 'string' && /^[A-Z][A-Z0-9]*-\d{3,}$/.test(value); }
function validEvidenceId(value) { return typeof value === 'string' && /^EV-\d{3,}$/.test(value); }
function refsExist(refs, known) { return Array.isArray(refs) && refs.length > 0 && refs.every((id) => known.has(id)); }

export function validateContract(contract, { expectedVersion } = {}) {
  const errors = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return { ok: false, errors: ['Contract must be an object.'] };
  for (const key of Object.keys(contract)) if (!CONTRACT_FIELDS.has(key)) errors.push(`Unknown top-level contract field: ${key}.`);
  if (typeof contract.contractId !== 'string' || !contract.contractId.trim()) errors.push('contractId is required.');
  if (!Number.isInteger(contract.version) || contract.version < 1) errors.push('version must be a positive integer.');
  if (expectedVersion !== undefined && contract.version !== expectedVersion) errors.push(`version must be ${expectedVersion}.`);
  if (!['draft', 'frozen'].includes(contract.status || 'draft')) errors.push('status must be draft or frozen.');
  if (typeof contract.intent !== 'string' || !contract.intent.trim()) errors.push('intent is required.');
  for (const name of ['obligations', 'acceptanceCriteria', 'invariants', 'preservation']) requireArray(contract[name], name, errors);
  const collections = ['obligations', 'acceptanceCriteria', 'invariants', 'preservation', 'publicSeams', 'nonFunctional'];
  const allIds = new Set();
  for (const collection of collections) for (const item of contract[collection] || []) {
    if (!item || !validId(item.id) || !item.id.startsWith(`${PREFIXES[collection]}-`)) errors.push(`${collection} contains an invalid ${PREFIXES[collection]} id.`);
    else if (allIds.has(item.id)) errors.push(`Duplicate id: ${item.id}.`); else allIds.add(item.id);
  }
  const acIds = ids(contract.acceptanceCriteria); const invIds = ids(contract.invariants); const targetIds = new Set([...acIds, ...invIds, ...ids(contract.preservation)]);
  for (const obligation of contract.obligations || []) {
    if (!PRIORITIES.has(obligation.priority)) errors.push(`${obligation.id || 'obligation'} has an invalid priority.`);
    if (typeof obligation.statement !== 'string' || !obligation.statement.trim()) errors.push(`${obligation.id || 'obligation'} needs a statement.`);
    if (!Array.isArray(obligation.sourceQuotes) || obligation.sourceQuotes.length === 0 || !obligation.sourceQuotes.every((q) => typeof q === 'string' && q.trim())) errors.push(`${obligation.id || 'obligation'} needs sourceQuotes.`);
    const linked = [...(obligation.acceptance || []), ...(obligation.invariants || [])];
    if (obligation.priority === 'must' && (!linked.length || !linked.every((id) => acIds.has(id) || invIds.has(id)))) errors.push(`${obligation.id || 'must obligation'} needs traced acceptance or invariant.`);
  }
  for (const item of contract.acceptanceCriteria || []) {
    const observableStatement = typeof item.statement === 'string' && item.statement.trim() && typeof item.observation === 'string' && item.observation.trim();
    const observableScenario = typeof item.given === 'string' && item.given.trim() && typeof item.when === 'string' && item.when.trim() && Array.isArray(item.then) && item.then.length > 0 && item.then.every((step) => typeof step === 'string' && step.trim());
    if (!observableStatement && !observableScenario) errors.push(`${item.id || 'criterion'} needs an observation with statement or given/when/then.`);
    if (!Array.isArray(item.evidence) || item.evidence.length === 0 || !item.evidence.every(validEvidenceId)) errors.push(`${item.id || 'criterion'} needs planned EV evidence ids.`);
  }
  for (const item of [...(contract.invariants || []), ...(contract.preservation || [])]) {
    if (typeof item.statement !== 'string' || !item.statement.trim()) errors.push(`${item.id || 'criterion'} needs a statement.`);
    if (!Array.isArray(item.evidence) || item.evidence.length === 0 || !item.evidence.every(validEvidenceId)) errors.push(`${item.id || 'criterion'} needs planned EV evidence ids.`);
  }
  if (contract.boundaries && (!Array.isArray(contract.boundaries.allowed) || !Array.isArray(contract.boundaries.forbidden))) errors.push('boundaries must have allowed and forbidden arrays.');
  return { ok: errors.length === 0, errors, targetIds };
}

export async function verifyRun(cwd, runId) {
  const { files, state } = await loadState(cwd, runId);
  if (!(await exists(files.brief))) throw new KernelError('Immutable brief is missing.', 'CORRUPT_STATE');
  const briefHash = sha256(await readFile(files.brief, 'utf8'));
  if (briefHash !== state.briefSha256) throw new KernelError('Immutable brief hash does not match state.', 'CORRUPT_STATE');
  for (const [version, expectedHash] of Object.entries(state.contractHashes || {})) {
    const file = path.join(files.contracts, `contract-v${String(version).padStart(3, '0')}.json`);
    const contract = await readJson(file, 'Frozen contract');
    if (contract.contractSha256 !== expectedHash || hashWithout(contract, 'contractSha256') !== expectedHash) throw new KernelError(`Frozen contract v${version} was changed.`, 'FROZEN_CONTRACT_CHANGED');
  }
  if (await exists(files.usage)) await loadUsage(files);
  return { files, state };
}

async function initRunUnlocked(cwd, runId, briefText) {
  const files = layout(cwd, runId);
  if (await exists(files.run)) throw new KernelError(`Run already exists: ${runId}`, 'RUN_EXISTS');
  if (await exists(files.active)) {
    const active = await readJson(files.active, 'Active run pointer');
    const activeRun = safeRunId(active.runId);
    const activeState = await loadState(cwd, activeRun);
    if (activeState.state.status === 'active') throw new KernelError(`An active run already exists: ${activeRun}`, 'ACTIVE_RUN_EXISTS');
    await unlink(files.active);
  }
  if (typeof briefText !== 'string' || !briefText.trim()) throw new KernelError('briefText is required.', 'INVALID_BRIEF');
  const brief = redact(briefText);
  await mkdir(files.contracts, { recursive: true });
  await writeTextAtomic(files.brief, brief);
  const now = new Date().toISOString();
  const state = setStateHash({ format: FORMAT, runId, status: 'active', phase: 'understand', briefSha256: sha256(brief), contractHashes: {}, currentContractVersion: null, createdAt: now, updatedAt: now });
  await writeJsonAtomic(files.state, state);
  await writeEvidence(files, { format: FORMAT, entries: [] });
  await writeUsage(files, unavailableUsage(now));
  await writeJsonAtomic(files.active, { format: FORMAT, runId, updatedAt: now });
  return { runId, briefSha256: state.briefSha256 };
}

export async function initRun(cwd, runId, briefText) {
  return withWorkspaceLock(cwd, `init:${safeRunId(runId)}`, () => initRunUnlocked(cwd, runId, briefText));
}

async function currentContract(files, state) {
  if (!state.currentContractVersion) throw new KernelError('No frozen contract exists.', 'NO_CONTRACT');
  const version = state.currentContractVersion;
  return readJson(path.join(files.contracts, `contract-v${String(version).padStart(3, '0')}.json`), 'Frozen contract');
}

function normalizeForMatch(value) { return String(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase(); }
async function validateSourceQuotes(files, contract, { authority = '', changedObligationIds = new Set() } = {}) {
  const brief = normalizeForMatch(await readFile(files.brief, 'utf8'));
  const authorityText = normalizeForMatch(redact(authority));
  const missing = (contract.obligations || []).flatMap((obligation) => (obligation.sourceQuotes || []).filter((quote) => {
    const normalized = normalizeForMatch(quote);
    return !brief.includes(normalized) && !(changedObligationIds.has(obligation.id) && authorityText.includes(normalized));
  }).map((quote) => `${obligation.id}: ${quote}`));
  if (missing.length) throw new KernelError('Contract sourceQuotes are not present in the sanitized brief.', 'SOURCE_QUOTE_NOT_IN_BRIEF', missing);
}

function collectionMap(contract, collection) { return new Map((contract[collection] || []).map((item) => [item.id, item])); }
export function normativeDiff(previous, candidate) {
  const changes = [];
  for (const collection of Object.keys(PREFIXES)) {
    const before = collectionMap(previous, collection); const after = collectionMap(candidate, collection);
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const prior = before.get(id); const next = after.get(id);
      if (canonicalJson(prior) !== canonicalJson(next)) changes.push({ token: id, previous: prior ?? null, next: next ?? null });
    }
  }
  const top = { INTENT: 'intent', ACTORS: 'actors', BOUNDARIES: 'boundaries', ASSUMPTIONS: 'assumptions', 'OUT-OF-SCOPE': 'outOfScope' };
  for (const [token, property] of Object.entries(top)) if (canonicalJson(previous[property] ?? null) !== canonicalJson(candidate[property] ?? null)) changes.push({ token, previous: previous[property] ?? null, next: candidate[property] ?? null });
  return changes;
}

function invalidationTargets(previous, changes) {
  const broad = changes.some((change) => TOP_LEVEL_TOKENS.includes(change.token) || change.token.startsWith('SEAM-') || change.token.startsWith('NFR-'));
  if (broad) return null;
  const targets = new Set(); const requirements = collectionMap(previous, 'obligations');
  for (const change of changes) {
    if (/^(AC|INV|PRES)-/.test(change.token)) targets.add(change.token);
    if (change.token.startsWith('REQ-')) for (const requirement of [change.previous, change.next, requirements.get(change.token)]) for (const target of [...(requirement?.acceptance || []), ...(requirement?.invariants || [])]) targets.add(target);
  }
  return targets;
}

async function freezeContractUnlocked(cwd, runId, candidate) {
  const { files, state } = await verifyRun(cwd, runId);
  requireActiveRun(state, runId);
  const expectedVersion = (state.currentContractVersion || 0) + 1;
  if (state.currentContractVersion) throw new KernelError('A frozen contract already exists; use contract amend.', 'AMEND_REQUIRED');
  const validation = validateContract(candidate, { expectedVersion });
  if (!validation.ok) throw new KernelError('Contract validation failed.', 'INVALID_CONTRACT', validation.errors);
  const contract = redactValue(structuredClone(candidate));
  await validateSourceQuotes(files, contract);
  contract.status = 'frozen';
  contract.source = { briefPath: 'brief.md', briefSha256: state.briefSha256 };
  contract.contractSha256 = hashWithout(contract, 'contractSha256');
  const output = path.join(files.contracts, 'contract-v001.json');
  await writeJsonAtomic(output, contract);
  state.currentContractVersion = 1; state.contractHashes['1'] = contract.contractSha256; state.phase = 'execute';
  await saveState(files, state);
  return { version: 1, contractSha256: contract.contractSha256, path: output };
}

export async function freezeContract(cwd, runId, candidate) {
  return withWorkspaceLock(cwd, `freeze-contract:${safeRunId(runId)}`, () => freezeContractUnlocked(cwd, runId, candidate));
}

async function amendContractUnlocked(cwd, runId, candidate, reason, affected, authority) {
  const { files, state } = await verifyRun(cwd, runId);
  requireActiveRun(state, runId);
  const previous = await currentContract(files, state);
  if (typeof reason !== 'string' || !reason.trim()) throw new KernelError('An amendment reason is required.', 'AMENDMENT_REASON_REQUIRED');
  if (typeof authority !== 'string' || !authority.trim()) throw new KernelError('An amendment authority is required.', 'AMENDMENT_AUTHORITY_REQUIRED');
  if (!Array.isArray(affected) || affected.length === 0) throw new KernelError('Affected contract ids are required.', 'AMENDMENT_AFFECTED_REQUIRED');
  const version = state.currentContractVersion + 1;
  const validation = validateContract(candidate, { expectedVersion: version });
  if (!validation.ok) throw new KernelError('Contract validation failed.', 'INVALID_CONTRACT', validation.errors);
  const contract = redactValue(structuredClone(candidate));
  const changes = normativeDiff(previous, contract);
  await validateSourceQuotes(files, contract, { authority, changedObligationIds: new Set(changes.filter((change) => change.token.startsWith('REQ-')).map((change) => change.token)) });
  const actualTokens = new Set(changes.map((change) => change.token)); const suppliedTokens = new Set(affected);
  if (changes.length === 0 || [...actualTokens].some((token) => !suppliedTokens.has(token)) || [...suppliedTokens].some((token) => !actualTokens.has(token))) {
    throw new KernelError('Amendment affects must exactly cover the normative contract diff.', 'INVALID_AMENDMENT', [...actualTokens]);
  }
  contract.status = 'frozen'; contract.source = { briefPath: 'brief.md', briefSha256: state.briefSha256 }; contract.amends = previous.version;
  contract.contractSha256 = hashWithout(contract, 'contractSha256');
  await writeJsonAtomic(path.join(files.contracts, `contract-v${String(version).padStart(3, '0')}.json`), contract);
  const evidence = await loadEvidence(files);
  const now = new Date().toISOString();
  const targets = invalidationTargets(previous, changes);
  for (const entry of evidence.entries || []) if (entry.contractVersion === previous.version && (targets === null || (entry.covers || []).some((id) => targets.has(id)))) {
    entry.status = 'invalidated'; entry.invalidatedAt = now; entry.invalidatedBy = `contract-v${version}`;
  }
  await writeEvidence(files, evidence);
  await writeJsonAtomic(path.join(files.amendments, `amendment-v${String(version).padStart(3, '0')}.json`), { format: FORMAT, fromVersion: previous.version, toVersion: version, reason: redact(reason), authority: redact(authority), affected: [...suppliedTokens], changes, createdAt: now });
  state.currentContractVersion = version; state.contractHashes[String(version)] = contract.contractSha256; state.phase = 'execute';
  await saveState(files, state);
  return { version, changes: [...actualTokens], invalidatedEvidence: (evidence.entries || []).filter((entry) => entry.status === 'invalidated' && entry.invalidatedBy === `contract-v${version}`).map((entry) => entry.evidenceId) };
}

export async function amendContract(cwd, runId, candidate, reason, affected, authority) {
  return withWorkspaceLock(cwd, `amend-contract:${safeRunId(runId)}`, () => amendContractUnlocked(cwd, runId, candidate, reason, affected, authority));
}

function allTargetIds(contract) { return new Set([...ids(contract.acceptanceCriteria), ...ids(contract.invariants), ...ids(contract.preservation)]); }
function plannedEvidence(contract) { return new Set([...(contract.acceptanceCriteria || []), ...(contract.invariants || []), ...(contract.preservation || [])].flatMap((item) => item.evidence || [])); }

function evidenceStoreHash(store) { return hashWithout(store, 'storeSha256'); }
async function loadEvidence(files) {
  const store = await readJson(files.evidence, 'Evidence store');
  if (store.format !== FORMAT || !Array.isArray(store.entries) || typeof store.storeSha256 !== 'string' || evidenceStoreHash(store) !== store.storeSha256) {
    throw new KernelError('Evidence store is corrupt.', 'CORRUPT_EVIDENCE');
  }
  return store;
}
async function writeEvidence(files, store) { store.storeSha256 = evidenceStoreHash(store); await writeJsonAtomic(files.evidence, store); }

function nonEmptyText(value) { return typeof value === 'string' && value.trim().length > 0; }

function usageHash(receipt) { return hashWithout(receipt, 'usageSha256'); }
function unavailableUsage(capturedAt = new Date().toISOString(), reason = 'The current surface did not expose authoritative per-task token usage.') {
  return { format: FORMAT, status: 'unavailable', source: 'host-unavailable', scope: 'task', capturedAt, reason };
}
function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0; }
function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) return false;
  const normalized = `${match[1]}.${(match[2] || '').padEnd(3, '0')}Z`; const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === normalized;
}
function singleLineText(value, maximum = 500) { return nonEmptyText(value) && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function usageErrors(receipt, { requireHash = false } = {}) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['Usage receipt must be an object.'];
  for (const key of Object.keys(receipt)) if (!USAGE_FIELDS.has(key)) errors.push(`Unknown usage field: ${key}.`);
  if (receipt.format !== FORMAT) errors.push(`format must be ${FORMAT}.`);
  if (!USAGE_STATUSES.has(receipt.status)) errors.push('status must be actual or unavailable.');
  if (!USAGE_SOURCES.has(receipt.source)) errors.push('source is not supported.');
  if (!USAGE_SCOPES.has(receipt.scope)) errors.push('scope must be turn, task, or run.');
  if (!canonicalTimestamp(receipt.capturedAt)) errors.push('capturedAt must be a canonical UTC ISO-8601 timestamp.');
  if (receipt.model !== undefined && (typeof receipt.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(receipt.model))) errors.push('model must be a bounded model identifier when supplied.');
  if (receipt.reference !== undefined && (typeof receipt.reference !== 'string' || !/^(?:(?:turn|response|resp|request|req|run|thread|trace|event|usage)[-_:][A-Za-z0-9._:-]{1,240}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/.test(receipt.reference))) errors.push('reference must be a recognized opaque event identifier.');
  if (receipt.reason !== undefined && !singleLineText(receipt.reason)) errors.push('reason must be bounded single-line text when supplied.');
  const numericFields = ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'];
  for (const field of numericFields) if (receipt[field] !== undefined && !nonNegativeInteger(receipt[field])) errors.push(`${field} must be a non-negative integer.`);
  if (receipt.status === 'actual') {
    if (receipt.source === 'host-unavailable') errors.push('actual usage needs an observed source.');
    if (!nonNegativeInteger(receipt.inputTokens) || !nonNegativeInteger(receipt.outputTokens)) errors.push('actual usage needs inputTokens and outputTokens.');
    if (nonNegativeInteger(receipt.inputTokens) && nonNegativeInteger(receipt.outputTokens) && receipt.totalTokens !== receipt.inputTokens + receipt.outputTokens) errors.push('totalTokens must equal inputTokens plus outputTokens.');
    if (nonNegativeInteger(receipt.cachedInputTokens) && nonNegativeInteger(receipt.inputTokens) && receipt.cachedInputTokens > receipt.inputTokens) errors.push('cachedInputTokens cannot exceed inputTokens.');
    if (nonNegativeInteger(receipt.cacheWriteInputTokens) && nonNegativeInteger(receipt.inputTokens) && receipt.cacheWriteInputTokens > receipt.inputTokens) errors.push('cacheWriteInputTokens cannot exceed inputTokens.');
    if (nonNegativeInteger(receipt.reasoningOutputTokens) && nonNegativeInteger(receipt.outputTokens) && receipt.reasoningOutputTokens > receipt.outputTokens) errors.push('reasoningOutputTokens cannot exceed outputTokens.');
  }
  if (receipt.status === 'unavailable') {
    if (receipt.source !== 'host-unavailable') errors.push('unavailable usage must use host-unavailable source.');
    if (!nonEmptyText(receipt.reason)) errors.push('unavailable usage needs a reason.');
    for (const field of numericFields) if (receipt[field] !== undefined) errors.push(`unavailable usage must not claim ${field}.`);
  }
  if (requireHash && (typeof receipt.usageSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.usageSha256))) errors.push('usageSha256 is missing or invalid.');
  return errors;
}
function sanitizeUsageInput(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new KernelError('Usage validation failed.', 'INVALID_USAGE', ['Usage receipt must be an object.']);
  const inputErrors = Object.keys(record).filter((key) => !USAGE_FIELDS.has(key) || key === 'usageSha256').map((key) => `Unknown or protected usage field: ${key}.`);
  if (record.format !== undefined && record.format !== FORMAT) inputErrors.push(`format must be ${FORMAT} when supplied.`);
  if (inputErrors.length) throw new KernelError('Usage validation failed.', 'INVALID_USAGE', inputErrors);
  const receipt = {
    format: FORMAT,
    status: record.status,
    source: record.source,
    scope: record.scope || 'task',
    capturedAt: record.capturedAt || new Date().toISOString(),
  };
  for (const field of ['model', 'reason', 'reference']) if (record[field] !== undefined) receipt[field] = redact(record[field]);
  for (const field of ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens']) if (record[field] !== undefined) receipt[field] = record[field];
  if (receipt.status === 'actual' && receipt.totalTokens === undefined && nonNegativeInteger(receipt.inputTokens) && nonNegativeInteger(receipt.outputTokens)) receipt.totalTokens = receipt.inputTokens + receipt.outputTokens;
  return receipt;
}
async function loadUsage(files) {
  const receipt = await readJson(files.usage, 'Usage receipt');
  const errors = usageErrors(receipt, { requireHash: true });
  if (errors.length || usageHash(receipt) !== receipt.usageSha256) throw new KernelError('Usage receipt is corrupt.', 'CORRUPT_USAGE', errors);
  return receipt;
}
async function writeUsage(files, receipt) {
  const stored = structuredClone(receipt); delete stored.usageSha256; stored.usageSha256 = usageHash(stored); await writeJsonAtomic(files.usage, stored); return stored;
}

async function recordUsageUnlocked(cwd, runId, record, expectedUsageSha256) {
  const { files } = await verifyRun(cwd, runId); const current = await loadUsage(files);
  if (expectedUsageSha256 !== undefined && current.usageSha256 !== expectedUsageSha256) throw new KernelError('Usage changed after the caller snapshot.', 'STALE_USAGE');
  const receipt = sanitizeUsageInput(record); const errors = usageErrors(receipt);
  if (errors.length) throw new KernelError('Usage validation failed.', 'INVALID_USAGE', errors);
  return writeUsage(files, receipt);
}

export async function recordUsage(cwd, runId, record, options = {}) {
  const expectedUsageSha256 = Object.prototype.hasOwnProperty.call(options, 'expectedUsageSha256')
    ? options.expectedUsageSha256
    : (await loadUsage((await verifyRun(cwd, safeRunId(runId))).files)).usageSha256;
  if (typeof expectedUsageSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedUsageSha256)) throw new KernelError('expectedUsageSha256 must identify the caller snapshot.', 'INVALID_USAGE');
  return withWorkspaceLock(cwd, `record-usage:${safeRunId(runId)}`, () => recordUsageUnlocked(cwd, runId, record, expectedUsageSha256));
}

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

async function recordEvidenceUnlocked(cwd, runId, record, { allowCaptured = false, expectedSnapshot } = {}) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state);
  requireActiveRun(state, runId);
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
  await writeEvidence(files, evidence); return entry;
}

export async function recordEvidence(cwd, runId, record) {
  return withWorkspaceLock(cwd, `record-evidence:${safeRunId(runId)}`, () => recordEvidenceUnlocked(cwd, runId, record));
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
  stream.once('end', () => settle(false)); stream.once('close', () => settle(true)); stream.once('error', () => settle(true));
  return { promise, force: () => { settle(true); stream.destroy(); } };
}

function isPhysicalDescendant(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

async function resolveContainedExisting(cwd, requested, label, kind) {
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

export async function captureEvidence(cwd, runId, template, argv, requestedCwd = '.', options = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((item) => typeof item === 'string' && item.length > 0)) throw new KernelError('evidence capture requires a command after --.', 'MISSING_COMMAND');
  const policy = capturePolicy(options); const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state);
  requireActiveRun(state, runId);
  const expectedSnapshot = { stateSha256: state.stateSha256, contractVersion: state.currentContractVersion, contractSha256: contract.contractSha256 };
  const intendedCwd = await resolveContainedExisting(cwd, requestedCwd, 'capture cwd', 'directory'); const relativeCwd = intendedCwd.relative;
  if (nonEmptyText(template?.artifact)) {
    try { await resolveContainedExisting(cwd, template.artifact, 'artifact', 'file'); }
    catch (error) { if (error.code !== 'CAPTURE_ARTIFACT_MISSING') throw error; }
  }
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
  const stdout = await settleCapturedOutput(stdoutCapture); const stderr = await settleCapturedOutput(stderrCapture);
  const entry = redactValue(structuredClone(template)); entry.command = argv.join(' '); entry.status = !timedOut && result.exitCode === 0 ? 'pass' : 'fail';
  entry.observed = timedOut ? `Capture timed out after ${policy.timeoutMs} ms. ${termination.observation}` : `Captured exit code ${result.exitCode}.`;
  entry.provenance = {
    kind: 'captured-command', argv, cwd: relativeCwd, exitCode: result.exitCode, signal: result.signal, timedOut, timeoutMs: policy.timeoutMs, termination,
    stdout: stdout.value, stderr: stderr.value, stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated, outputIncomplete: stdout.incomplete || stderr.incomplete,
    capturedAt: new Date().toISOString(), artifactHashes: await artifactHashes(cwd, entry, { required: entry.status === 'pass' }),
  };
  return withWorkspaceLock(cwd, `capture-evidence:${safeRunId(runId)}`, () => recordEvidenceUnlocked(cwd, runId, entry, { allowCaptured: true, expectedSnapshot }));
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

function normalizedZone(zone) { return safeRelativePath(zone, 'zone').replace(/\/$/, '').toLowerCase(); }
function zonesOverlap(left, right) { return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`); }

export function validateExecution(execution, contract) {
  const errors = []; const units = execution?.units;
  if (!Array.isArray(units)) return { ok: false, errors: ['execution.units must be an array.'] };
  const unitMap = new Map(); const traceTargets = new Set([...ids(contract.obligations), ...allTargetIds(contract)]);
  for (const unit of units) {
    if (!unit || !validId(unit.unitId)) { errors.push('Each work unit needs a valid unitId.'); continue; }
    if (unitMap.has(unit.unitId)) errors.push(`Duplicate work unit: ${unit.unitId}.`); else unitMap.set(unit.unitId, unit);
    const refs = [...(unit.obligations || []), ...(unit.criteria || [])];
    if (refs.length === 0 || !refs.every((id) => traceTargets.has(id))) errors.push(`${unit.unitId} is untraced or references an unknown id.`);
    if (!Array.isArray(unit.zone) || unit.zone.length === 0) errors.push(`${unit.unitId} needs a write zone.`);
    else { try { unit.zone.forEach(normalizedZone); } catch (error) { errors.push(`${unit.unitId} has an unsafe zone.`); } }
  }
  for (const unit of units) for (const dependency of unit.dependsOn || []) if (!unitMap.has(dependency)) errors.push(`${unit.unitId} depends on unknown unit ${dependency}.`);
  const visiting = new Set(); const visited = new Set(); const reaches = new Map();
  const visit = (id, stack = []) => {
    if (visiting.has(id)) { errors.push(`Execution DAG contains a cycle: ${[...stack, id].join(' -> ')}.`); return new Set(); }
    if (visited.has(id)) return reaches.get(id);
    visiting.add(id); const result = new Set(); const unit = unitMap.get(id);
    for (const dep of unit?.dependsOn || []) { result.add(dep); for (const nested of visit(dep, [...stack, id])) result.add(nested); }
    visiting.delete(id); visited.add(id); reaches.set(id, result); return result;
  };
  for (const id of unitMap.keys()) visit(id);
  const list = [...unitMap.values()];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const a = list[i]; const b = list[j]; const sequential = reaches.get(a.unitId)?.has(b.unitId) || reaches.get(b.unitId)?.has(a.unitId);
    if (!sequential && (a.zone || []).some((x) => (b.zone || []).some((y) => zonesOverlap(normalizedZone(x), normalizedZone(y))))) errors.push(`Parallel units ${a.unitId} and ${b.unitId} have overlapping write zones.`);
  }
  return { ok: errors.length === 0, errors };
}

async function fileSha256OrNull(file) {
  try { return sha256(await readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function validateAndSaveExecutionUnlocked(cwd, runId, execution, expectedExecutionSha256) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state); const result = validateExecution(execution, contract);
  requireActiveRun(state, runId);
  const currentExecutionSha256 = await fileSha256OrNull(files.execution);
  if (expectedExecutionSha256 !== undefined && currentExecutionSha256 !== expectedExecutionSha256) throw new KernelError('Execution view changed after the caller snapshot.', 'STALE_EXECUTION');
  if (!result.ok) throw new KernelError('Execution validation failed.', 'INVALID_EXECUTION', result.errors);
  await writeJsonAtomic(files.execution, redactValue(execution)); return { ...result, executionSha256: await fileSha256OrNull(files.execution) };
}

export async function validateAndSaveExecution(cwd, runId, execution, options = {}) {
  const files = layout(cwd, safeRunId(runId));
  const expectedExecutionSha256 = Object.prototype.hasOwnProperty.call(options, 'expectedExecutionSha256') ? options.expectedExecutionSha256 : await fileSha256OrNull(files.execution);
  if (expectedExecutionSha256 !== null && (typeof expectedExecutionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedExecutionSha256))) throw new KernelError('expectedExecutionSha256 must identify the caller snapshot or be null.', 'INVALID_EXECUTION');
  return withWorkspaceLock(cwd, `save-execution:${safeRunId(runId)}`, () => validateAndSaveExecutionUnlocked(cwd, runId, execution, expectedExecutionSha256));
}

export function routeTask(input = {}) {
  const normalizedText = String(input.text || input.intent || input.request || '').normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е');
  const explicitInvocation = /^\s*(?:\$pinmind|@pinmind)(?=\s|[,:;.!?]|$)/u.test(normalizedText);
  const text = normalizedText.replace(/^\s*(?:\$pinmind|@pinmind)(?=\s|[,:;.!?]|$)[,:;.!?]?\s*/u, '');
  const explicit = String(input.route || input.kind || '').trim().toLowerCase().replace(/[ _]/g, '-');
  const aliases = new Map([['review', 'audit'], ['audit', 'audit'], ['investigate', 'investigation'], ['investigation', 'investigation'], ['bug', 'investigation'], ['debug', 'investigation'], ['change', 'software-change'], ['software', 'software-change'], ['software-change', 'software-change'], ['operational', 'operational'], ['simple', 'simple'], ['spike', 'spike']]);
  const explicitRoute = aliases.get(explicit);
  const signalSet = new Set(); const mark = (condition, signal) => { if (condition) signalSet.add(signal); return condition; };
  if (explicitInvocation) mark(true, 'activation:explicit');
  if (explicit) mark(true, `explicit:${explicitRoute || 'unknown'}`);
  const highRisk = mark(/\b(auth(?:entication|orization)?|password|payment|migration|delete|deletion|permission|races?|race\s+conditions?|concurrency|security|secret|production)\b|аутентификац|авторизац|парол|оплат|платеж|миграц|удален|прав.*доступ|гонк|конкурент|безопасност|секрет|продакшн/u.test(text), 'risk:high');
  const multiSystem = /\b(payment|integration|multi-system|distributed|webhook)\b|платеж|интеграц|нескольк.*систем|вебхук/u.test(text);
  const architectural = mark(/\b(architecture|architectural|public\s+(?:api|interface)|breaking\s+change|system\s+shape|system\s+boundar(?:y|ies)|service\s+boundar(?:y|ies)|data\s+schema)\b|архитектур|публичн\S*\s+(?:api|интерфейс)|границ\S*\s+(?:сервис|систем)|схем\S*\s+обмен|перепроектир/u.test(text), 'clarity:architectural');
  const crossCutting = multiSystem || architectural || /\b(api|database|schema|shared state|canonical (?:state|mutation|change)|process group|workspace-wide|lifecycle|migration)\b|all\s+canonical\s+(?:state\s+)?(?:mutations?|changes?)|нескольк.*модул|общ.*состояни|каноническ.*(?:состояни|изменени)|жизненн.*цикл|групп.*процесс|баз\S*\s+данн|миграц|мигрир/u.test(text);
  if (multiSystem) mark(true, 'span:multi-system'); else if (crossCutting) mark(true, 'span:cross-cutting');
  const uncertain = /\b(feasibility|research|can we|should we|unknown|explore|compare (?:the )?(?:options|approaches))\b|возможн|исследу|можем ли|неизвест|стоит ли|погугл|сравни.*(?:вариант|подход)/u.test(text);
  const trivial = mark(/^\s*(?:hi|hello|hey|thanks|thank you|привет|здравствуй(?:те)?|спасибо)[!.,?\s]*$/u.test(text), 'intent:trivial');
  const noChangePattern = /\b(?:(?:do not|don't|without)\s+(?:make\s+)?(?:any\s+)?(?:change|changes|modify|modification|edit|editing|alter|touch)|(?:report|inspect|review)\s+only|only\s+report|read[- ]only|without\s+changes?)\b|ничего\s+не\s+(?:меняй|изменяй|исправляй|трогай)|(?:пока\s+)?не\s+(?:меняй|изменяй|вноси|трогай|правь|редактируй)(?=\s|[.,;:!?]|$)|(?:в\s+)?код\S*\s+(?:пока\s+)?не\s+(?:лезь|правь|меняй|трогай)|не\s+меняя|без\s+(?:изменени|правок)|правк\S*\s+не\s+вноси|оставь\s+код\s+как\s+есть|только\s+(?:сообщи|покажи|дай).*результат|только\s+(?:проверь|посмотри)/u;
  const noChange = mark(noChangePattern.test(text), 'authority:no-change');
  const affirmativeText = text
    .replace(new RegExp(noChangePattern.source, 'gu'), '')
    .replace(/\bafter\s+(?:the\s+)?(?:update|change|migration)\b/gu, '')
    .trim();
  const requestedChange = /\b(fix|change|modify|edit|implement|add|update|remove|delete|rewrite|refactor|harden|improve|optimi[sz]e|redesign|migrate)\b|исправ|измен|внес|реализ(?:уй|овать|ируй|ировать)|добав|обнов(?:и|ить|ляй|ите)|удал|перепиш|рефактор|улучш|оптимиз|переработ|перепроектир|мигрир|мигриру|сделай|пофикс|почин|усил.*(?:защит|безопас)/u.test(affirmativeText);
  const softwareImpact = /\b(add|render|use|build|component|page|ui|catalog|asset|assets|code|implement|api|database|schema|client)\b|добав|рендер|использ.*(?:изображ|asset|ресурс)|страниц|компонент|интерфейс|каталог|код|баз\S*\s+данн|схем/u.test(text);
  const translationIntent = /\b(?:translate|translation)\b|перевед/u.test(text);
  const boundedText = /\b(?:translate\s+(?:this|it)|(?:this|the)?\s*(?:sentence|phrase|word|paragraph|text))\b|перевед\S*\s+(?:это|этот|эту|его|её|ее)|(?:это|этот|эту|данн\S*)?\s*(?:предложен|фраз|слов|абзац|текст)/u.test(text);
  const productLocalization = /\b(app|application|site|website|ui|interface|product|project|locali[sz]ation|i18n)\b|приложен|сайт|интерфейс|продукт|проект|локализац/u.test(text);
  const translation = translationIntent && boundedText && !productLocalization && !highRisk && !softwareImpact;
  const stableFact = mark(/^(?:what\s+is\s+the\s+capital\s+of\s+[\p{L} .'-]+|(?:the\s+)?capital\s+of\s+[\p{L} .'-]+|столиц[аы]\s+[\p{L} .'-]+)\?$/u.test(text.trim()) && !highRisk && !softwareImpact, 'intent:stable-fact');
  const boundedRewrite = /\b(?:rewrite|shorten|rephrase)\b[^\n]{0,80}\b(?:this|the)?\s*(?:sentence|phrase|paragraph|text)\b|(?:перепиш|сократ|перефразир)\S*[^\n]{0,80}(?:предложен|фраз|абзац|текст)/u.test(text) && !productLocalization && !softwareImpact;
  const boundedFormat = /\bformat\b[^\n]{0,80}\b(?:this|the)?\s*(?:short\s+)?(?:list|text|paragraph)\b|отформатир\S*[^\n]{0,80}(?:коротк\S*\s+)?(?:список|текст|абзац)/u.test(text) && !softwareImpact;
  if (translation || boundedRewrite) mark(true, 'intent:bounded-text'); if (boundedFormat) mark(true, 'intent:bounded-format');
  const operationalIntent = /\b(copy|rename|move|fix typo|sort files?)\b|скопир|переимен|перемест|исправ.*опечат|отсортир.*файл/u.test(text) && !softwareImpact;
  const operational = operationalIntent && !noChange;
  const symptom = /\b(?:errors?|fail(?:s|ed|ure|ing)?|returns?\s+[45]\d{2}|crash(?:es|ed|ing)?|broken|not\s+work(?:ing)?)\b|ошиб|падает|сломал|не\s+работает/u.test(text);
  const investigation = /\b(debug|diagnos|investigat|root cause|reproduce|bug|find (?:the )?cause)\b|диагност|исследу.*ошиб|найд.*причин|воспроизвед|баг|разберис/u.test(text) || (/\bwhy\b|почему|пачему/u.test(text) && symptom) || (symptom && !requestedChange);
  const auditRequest = /\b(audit|review|reviewing|pr review|security review|inspect|evaluate|check|report)\b|аудит|ревью|провер|посмотр|оцени|проанализир|глян|отчет|сообщи/u.test(text);
  const spike = /\b(feasibility|research|can we|should we|spike|explore|compare (?:the )?(?:options|approaches))\b|оцен.*возможност|исследу|можем ли|спайк|стоит ли|погугл|сравни.*(?:вариант|подход)/u.test(text);
  const recognizedReadOnlyIntent = investigation || auditRequest || spike || trivial || stableFact || translation || boundedRewrite || boundedFormat;
  const conflict = mark(noChange && (requestedChange || operationalIntent || !recognizedReadOnlyIntent), 'authority:conflict');
  const vague = mark(/^(?:сделай|почини|исправь|улучши)(?:\s+(?:это|нормально|как\s+надо))?[!.,?\s]*$/u.test(text.trim()), 'ambiguity:vague');
  const audit = conflict || (auditRequest && !investigation && (!requestedChange || noChange));
  if (requestedChange) mark(true, 'intent:change'); if (softwareImpact) mark(true, 'impact:software');
  if (operationalIntent) mark(true, 'intent:operational'); if (investigation) mark(true, 'intent:investigation'); if (spike) mark(true, 'intent:spike'); if (audit) mark(true, 'intent:audit');
  let selectedExplicit;
  if (explicitRoute === 'audit' || explicitRoute === 'investigation' || explicitRoute === 'software-change') selectedExplicit = explicitRoute;
  else if (explicitRoute === 'simple' && (trivial || stableFact || translation || boundedRewrite || boundedFormat || (!requestedChange && !operationalIntent && !softwareImpact && !highRisk && !architectural))) selectedExplicit = explicitRoute;
  else if (explicitRoute === 'operational' && operationalIntent && !noChange && !requestedChange && !highRisk && !architectural) selectedExplicit = explicitRoute;
  else if (explicitRoute === 'spike' && spike && !requestedChange && !softwareImpact && !highRisk && !architectural) selectedExplicit = explicitRoute;
  const inferredRoute = trivial || stableFact || translation || boundedRewrite || boundedFormat ? 'simple' : operational ? 'operational' : investigation ? 'investigation' : spike ? 'spike' : audit ? 'audit' : 'software-change';
  const route = selectedExplicit ?? inferredRoute;
  const risk = highRisk ? 'high' : (route === 'operational' || route === 'simple' || route === 'spike' ? 'low' : 'medium');
  const executionSpan = multiSystem ? 'multi-system' : crossCutting ? 'cross-cutting' : 'local';
  const clarity = input.clarity === 'architectural' || architectural ? 'architectural' : (input.clarity === 'uncertain' || uncertain || route === 'spike' || conflict || vague ? 'uncertain' : 'clear');
  if (signalSet.size === 0) signalSet.add('intent:default-change');
  const blockedExplicit = Boolean(explicitRoute && selectedExplicit !== explicitRoute);
  const confidence = conflict || vague || !text.trim() ? 'low' : (blockedExplicit || signalSet.has('intent:default-change') ? 'medium' : 'high');
  const needsHumanConfirmation = conflict || vague || !text.trim();
  const reasons = {
    simple: translation ? 'A bounded translation request needs no tools or persistent workflow.' : (boundedRewrite || boundedFormat ? 'A bounded text request needs no tools or persistent workflow.' : (stableFact ? 'A single stable fact stays lightweight.' : 'An obvious trivial or explicit simple request stays lightweight.')),
    operational: 'A bounded operational action does not change software behavior.',
    spike: 'The requested output is knowledge, not a committed product change.',
    audit: 'The request evaluates existing work without authorizing a product change.',
    investigation: 'The request needs a failing feedback loop and root-cause evidence first.',
    'software-change': highRisk ? 'A software change affects a high-risk behavior.' : 'A software behavior change requires a contract and evidence.',
  };
  return { route, clarity, executionSpan, risk, reason: reasons[route], signals: [...signalSet], confidence, needsHumanConfirmation };
}

export async function stateShow(cwd, requestedRunId) {
  let runId = requestedRunId;
  if (!runId) {
    const activePath = path.resolve(cwd, '.pinmind', 'active.json');
    if (!(await exists(activePath))) throw new KernelError('There is no active run.', 'NO_ACTIVE_RUN');
    const active = await readJson(activePath, 'Active run pointer'); runId = active.runId;
  }
  const verified = await verifyRun(cwd, safeRunId(runId));
  return { runId, status: verified.state.status, phase: verified.state.phase, currentContractVersion: verified.state.currentContractVersion, updatedAt: verified.state.updatedAt };
}

export async function stateResume(cwd, requestedRunId) {
  const summary = await stateShow(cwd, requestedRunId);
  if (summary.status !== 'active') throw new KernelError(`Run ${summary.runId} is complete.`, 'RUN_COMPLETE');
  return { ...summary, resumePhase: summary.phase, message: `Resume ${summary.runId} at ${summary.phase}.` };
}

function publicUsage(receipt) {
  return {
    status: receipt.status,
    source: receipt.source,
    scope: receipt.scope,
    model: receipt.model ?? null,
    inputTokens: receipt.inputTokens ?? null,
    cachedInputTokens: receipt.cachedInputTokens ?? null,
    cacheWriteInputTokens: receipt.cacheWriteInputTokens ?? null,
    outputTokens: receipt.outputTokens ?? null,
    reasoningOutputTokens: receipt.reasoningOutputTokens ?? null,
    totalTokens: receipt.totalTokens ?? null,
    capturedAt: receipt.capturedAt,
    reason: receipt.reason ?? null,
  };
}
function formatCount(value) { return value === null || value === undefined ? 'unavailable' : value.toLocaleString('en-US'); }
function renderTokenUsage(receipt) {
  const usage = publicUsage(receipt);
  const lines = [
    '## Token usage',
    `- Status: ${usage.status}`,
    `- Total: ${formatCount(usage.totalTokens)}`,
    `- Source: ${usage.source}`,
    `- Scope: ${usage.scope}`,
  ];
  if (usage.status === 'actual') lines.push(
    `- Input: ${formatCount(usage.inputTokens)}`,
    `- Cached input: ${formatCount(usage.cachedInputTokens)}`,
    `- Cache-write input: ${formatCount(usage.cacheWriteInputTokens)}`,
    `- Output: ${formatCount(usage.outputTokens)}`,
    `- Reasoning output: ${formatCount(usage.reasoningOutputTokens)}`,
    `- Model: ${usage.model || 'unavailable'}`,
  );
  if (usage.reason) lines.push(`- Reason: ${usage.reason}`);
  lines.push(`- Captured at: ${usage.capturedAt}`);
  return lines.join('\n');
}
async function usageForReport(files, fallbackCapturedAt) {
  if (await exists(files.usage)) return loadUsage(files);
  return unavailableUsage(fallbackCapturedAt, 'Authoritative token usage was not recorded for this run.');
}

export async function reportRun(cwd, runId, format = 'json') {
  const { files, state } = await verifyRun(cwd, safeRunId(runId));
  const contract = state.currentContractVersion ? await currentContract(files, state) : null;
  const evidence = await loadEvidence(files); const currentEntries = (evidence.entries || []).filter((entry) => entry.contractVersion === state.currentContractVersion);
  const statuses = ['pass', 'fail', 'uncertain', 'pending-review', 'not-applicable'];
  const counts = Object.fromEntries(statuses.map((status) => [status, currentEntries.filter((entry) => entry.status === status).length]));
  const receipt = await usageForReport(files, state.createdAt);
  const summary = { format: FORMAT, runId, status: state.status, phase: state.phase, contract: contract ? { contractId: contract.contractId, version: state.currentContractVersion } : null, evidence: { total: currentEntries.length, counts }, tokenUsage: publicUsage(receipt), updatedAt: state.updatedAt };
  if (format === 'json') return summary;
  if (format !== 'md' && format !== 'markdown') throw new KernelError('Report format must be json or md.', 'INVALID_REPORT_FORMAT');
  const contractLine = contract ? `${contract.contractId} v${state.currentContractVersion}` : 'not frozen';
  return `# Pinmind run report\n\n- Run: ${runId}\n- Status: ${state.status}\n- Phase: ${state.phase}\n- Contract: ${contractLine}\n- Evidence: ${counts.pass}/${currentEntries.length} passing\n\n${renderTokenUsage(receipt)}\n`;
}

async function trustworthyPassingEvidence(cwd, entry, criticalTargets = new Set()) {
  if (entry.status !== 'pass') return false;
  if (entry.provenance?.kind === 'manual-attestation') return !(entry.covers || []).some((id) => criticalTargets.has(id)) && nonEmptyText(entry.procedure) && !nonEmptyText(entry.command);
  if (entry.provenance?.kind !== 'captured-command') return false;
  const captured = entry.provenance;
  if (captured.exitCode !== 0 || !Array.isArray(captured.argv) || captured.argv.length === 0 || !nonEmptyText(captured.capturedAt)) return false;
  if (nonEmptyText(entry.artifact)) {
    const relative = safeRelativePath(entry.artifact, 'artifact'); const expected = captured.artifactHashes?.[relative];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return false;
    try { const artifact = await resolveContainedExisting(cwd, relative, 'artifact', 'file'); if (sha256(await readFile(artifact.absolute)) !== expected) return false; } catch { return false; }
  }
  return nonEmptyText(entry.artifact) || nonEmptyText(entry.reference);
}

async function finalVerifyUnlocked(cwd, runId) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state); const evidenceResult = await validateEvidence(cwd, runId); const errors = [...evidenceResult.errors];
  const entries = evidenceResult.entries;
  const contractTargets = [...(contract.acceptanceCriteria || []), ...(contract.invariants || []), ...(contract.preservation || [])];
  const targetsById = new Map(contractTargets.map((item) => [item.id, item]));
  const criticalTargets = new Set(contractTargets.filter((item) => item.critical).map((item) => item.id));
  const requiredTargets = new Set([...(contract.invariants || []).map((item) => item.id), ...(contract.preservation || []).map((item) => item.id)]);
  for (const obligation of contract.obligations || []) if (obligation.priority === 'must') {
    const targets = [...(obligation.acceptance || []), ...(obligation.invariants || [])];
    if (targets.length === 0) errors.push(`${obligation.id} has no acceptance or invariant.`);
    for (const target of targets) requiredTargets.add(target);
  }
  for (const target of requiredTargets) {
    for (const evidenceId of targetsById.get(target)?.evidence || []) {
      const matches = entries.filter((entry) => entry.contractVersion === state.currentContractVersion && entry.evidenceId === evidenceId && (entry.covers || []).includes(target));
      if (!(await Promise.all(matches.map((entry) => trustworthyPassingEvidence(cwd, entry, criticalTargets)))).some(Boolean)) errors.push(`${target} lacks trustworthy passing evidence for planned ${evidenceId}.`);
    }
  }
  if (await exists(files.execution)) {
    const execution = await readJson(files.execution, 'Execution view'); const executionResult = validateExecution(execution, contract); errors.push(...executionResult.errors);
  }
  return { ok: errors.length === 0, runId, contractVersion: state.currentContractVersion, errors };
}

export async function finalVerify(cwd, runId) { return finalVerifyUnlocked(cwd, runId); }

async function finalizeRunUnlocked(cwd, runId, verification) {
  if (!verification?.ok) throw new KernelError('Cannot finalize a failed verification.', 'FINAL_GATE_FAILED', verification?.errors || []);
  verification = await finalVerifyUnlocked(cwd, runId);
  if (!verification.ok) throw new KernelError('Final verification changed before commit.', 'FINAL_GATE_FAILED', verification.errors);
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state); const evidence = await loadEvidence(files);
  if (state.status !== 'active') throw new KernelError(`Run ${runId} is already complete.`, 'RUN_COMPLETE');
  const active = await readJson(files.active, 'Active run pointer');
  if (active.runId !== runId) throw new KernelError('Only the active run can be finalized.', 'NOT_ACTIVE_RUN');
  const currentEntries = evidence.entries.filter((entry) => entry.contractVersion === state.currentContractVersion);
  const passed = currentEntries.filter((entry) => entry.status === 'pass').length;
  const statuses = ['pass', 'fail', 'uncertain', 'pending-review', 'not-applicable'];
  const counts = statuses.map((status) => `- ${status}: ${currentEntries.filter((entry) => entry.status === status).length}`).join('\n');
  const attention = statuses.slice(1).map((status) => `- ${status}: ${currentEntries.filter((entry) => entry.status === status).map((entry) => entry.evidenceId).join(', ') || 'none'}`).join('\n');
  const manual = currentEntries.filter((entry) => entry.provenance?.kind === 'manual-attestation').map((entry) => entry.evidenceId).join(', ') || 'none';
  const captured = currentEntries.filter((entry) => entry.provenance?.kind === 'captured-command').map((entry) => entry.evidenceId).join(', ') || 'none';
  const completionBasis = manual === 'none' ? 'machine-captured evidence' : 'mixed machine-captured and manual/unreplayed evidence';
  let receipt;
  if (await exists(files.usage)) receipt = await loadUsage(files);
  else receipt = await writeUsage(files, unavailableUsage(new Date().toISOString(), 'Authoritative token usage was not recorded for this run.'));
  const report = `# Pinmind final report\n\n- Run: ${runId}\n- Contract: ${contract.contractId} v${state.currentContractVersion}\n- Evidence: ${passed}/${currentEntries.length} passing\n\n## Evidence status counts\n${counts}\n\n## Current evidence requiring attention\n${attention}\n\n## Evidence provenance\n- machine-captured: ${captured}\n- manual/unreplayed: ${manual}\n\n${renderTokenUsage(receipt)}\n\n- MUST evidence coverage: satisfied\n- Completion basis: ${completionBasis}\n- Replay note: stored commands were verified for captured provenance and artifact integrity, but were not replayed during finalization\n`;
  await writeTextAtomic(files.final, report);
  state.phase = 'finalize'; state.status = 'complete'; await saveState(files, state);
  const latest = await readJson(files.active, 'Active run pointer');
  if (latest.runId === runId) await unlink(files.active);
  return { ...verification, finalized: true, finalPath: files.final, tokenUsage: publicUsage(receipt) };
}

export async function finalizeRun(cwd, runId, verification) {
  return withWorkspaceLock(cwd, `finalize:${safeRunId(runId)}`, () => finalizeRunUnlocked(cwd, runId, verification));
}

export async function readInputJson(file) { return readJson(path.resolve(file)); }
export async function readBrief(file) { return readFile(path.resolve(file), 'utf8'); }
export function generateRunId() { return `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`; }
