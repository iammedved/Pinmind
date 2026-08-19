import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access, rename, unlink, open, realpath, stat, lstat, readdir } from 'node:fs/promises';
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
const TRANSITION_OPERATIONS = new Set(['init', 'freeze', 'amend', 'evidence', 'finalize']);

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
    .replace(/(\[\s*)(["'])((?:[A-Za-z_][A-Za-z0-9_]*_)?(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|ACCESS_KEY|SECRET_KEY|PRIVATE_KEY|CREDENTIALS?|DATABASE_URL|DB_URL|CONNECTION_STRING))\2(\s*\]\s*=\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\\r\n])*`|[^;,\r\n)\]}]+)/gi, '$1$2$3$2$4"[REDACTED]"')
    .replace(/(["'])((?:[A-Za-z_][A-Za-z0-9_]*_)?(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|ACCESS_KEY|SECRET_KEY|PRIVATE_KEY|CREDENTIALS?|DATABASE_URL|DB_URL|CONNECTION_STRING))\1(\s*:\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^,}\r\n]+)/gi, '$1$2$1$3"[REDACTED]"')
    .replace(/(^|[^A-Za-z0-9_])((?:(?:export|set)[ \t]+|\$env:)?(?:[A-Za-z_][A-Za-z0-9_]*_)?(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|ACCESS_KEY|SECRET_KEY|PRIVATE_KEY|CREDENTIALS?|DATABASE_URL|DB_URL|CONNECTION_STRING)[ \t]*[=:][ \t]*)[^\r\n]*/gim, '$1$2[REDACTED]')
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

const SAFE_EXECUTABLE_NAME = /^(?:bash|bun|cargo|cmake|cmd|deno|eslint|git|go|jest|make|meson|ninja|node(?:js)?|npm|npx|pnpm|powershell|pwsh|pytest|python(?:3(?:\.\d+)?)?|ruby|rustc|sh|true|tsc|vitest|yarn|zsh)(?:\.exe)?$/i;

export function redactArgv(argv) {
  if (!Array.isArray(argv)) return argv;
  if (argv.length === 0) return [];
  const executable = typeof argv[0] === 'string' ? path.basename(argv[0]) : '';
  const executableLabel = SAFE_EXECUTABLE_NAME.test(executable) ? executable : '[REDACTED EXECUTABLE]';
  return [executableLabel, ...argv.slice(1).map(() => '[REDACTED ARG]')];
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function readJson(file, label = 'JSON file') {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw new KernelError(`${label} is unreadable or invalid JSON: ${file}`, 'INVALID_JSON', [error.message]); }
}
async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    if (process.platform !== 'win32' || !['EISDIR', 'EPERM', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error;
  } finally { await handle?.close(); }
}
async function ensureDirectoryDurable(directory) {
  const before = await existingEntry(directory, 'write parent');
  if (before) {
    if (before.isSymbolicLink() || !before.isDirectory()) throw unsafeStatePath('write parent', 'Expected a physical directory.');
    return;
  }
  const parent = path.dirname(directory);
  if (parent !== directory) await ensureDirectoryDurable(parent);
  try { await mkdir(directory); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await syncDirectory(parent);
}
async function ensureParentDirectory(file) { await ensureDirectoryDurable(path.dirname(file)); }
async function writeJsonAtomic(file, value) {
  await ensureParentDirectory(file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, file); await syncDirectory(path.dirname(file));
  }
  catch (error) { try { await unlink(temporary); } catch {} throw error; }
  finally { await handle?.close(); }
}
async function writeTextAtomic(file, value) {
  await ensureParentDirectory(file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(value, 'utf8'); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, file); await syncDirectory(path.dirname(file));
  }
  catch (error) { try { await unlink(temporary); } catch {} throw error; }
  finally { await handle?.close(); }
}
async function unlinkDurable(file) { await unlink(file); await syncDirectory(path.dirname(file)); }
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function layout(cwd, runId) {
  const safe = safeRunId(runId);
  const root = path.resolve(cwd, '.pinmind');
  const runs = path.join(root, 'runs');
  const run = path.join(runs, safe);
  return { root, runs, run, lock: path.join(root, 'writer.lock'), transition: path.join(root, 'transition.json'), active: path.join(root, 'active.json'), brief: path.join(run, 'brief.md'), state: path.join(run, 'state.json'), baseline: path.join(run, 'baseline.json'), evidence: path.join(run, 'evidence.json'), final: path.join(run, 'final.md'), execution: path.join(run, 'execution.json'), contracts: path.join(run, 'contracts'), amendments: path.join(run, 'amendments') };
}

function unsafeStatePath(label, detail = '') {
  return new KernelError(`Pinmind state ${label} must be a physical path inside the workspace.${detail ? ` ${detail}` : ''}`, 'UNSAFE_STATE_PATH');
}

async function existingEntry(candidate, label) {
  try { return await lstat(candidate); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw unsafeStatePath(label, error.message);
  }
}

async function verifyStateEntry(candidate, boundary, kind, label) {
  const entry = await existingEntry(candidate, label);
  if (!entry) return false;
  const validKind = kind === 'directory' ? entry.isDirectory() : entry.isFile();
  if (entry.isSymbolicLink() || !validKind) throw unsafeStatePath(label, `Expected a regular ${kind}.`);
  let resolved;
  try { resolved = await realpath(candidate); }
  catch (error) { throw unsafeStatePath(label, error.message); }
  if (!isPhysicalDescendant(boundary, resolved)) throw unsafeStatePath(label, 'The resolved path escapes its state boundary.');
  return true;
}

async function verifiedStateRoot(cwd, { create = false } = {}) {
  let workspace;
  try { workspace = await realpath(path.resolve(cwd)); }
  catch (error) { throw unsafeStatePath('workspace', error.message); }
  const workspaceEntry = await existingEntry(workspace, 'workspace');
  if (!workspaceEntry?.isDirectory() || workspaceEntry.isSymbolicLink()) throw unsafeStatePath('workspace', 'Expected a physical directory.');
  const root = path.join(workspace, '.pinmind');
  let exists = await verifyStateEntry(root, workspace, 'directory', 'root');
  if (!exists && create) {
    try { await mkdir(root, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw unsafeStatePath('root', error.message); }
    exists = await verifyStateEntry(root, workspace, 'directory', 'root');
    if (!exists) throw unsafeStatePath('root', 'The directory could not be created safely.');
  }
  if (exists) {
    await verifyStateEntry(path.join(root, 'active.json'), root, 'file', 'active pointer');
    await verifyStateEntry(path.join(root, 'writer.lock'), root, 'file', 'writer lock');
    await verifyStateEntry(path.join(root, 'transition.json'), root, 'file', 'transition journal');
  }
  return { workspace, root, exists };
}

async function verifiedLayout(cwd, runId, { createRoot = false } = {}) {
  const stateRoot = await verifiedStateRoot(cwd, { create: createRoot });
  const files = layout(stateRoot.workspace, runId);
  if (!stateRoot.exists) return files;
  if (!(await verifyStateEntry(files.runs, files.root, 'directory', 'runs directory'))) return files;
  if (!(await verifyStateEntry(files.run, files.root, 'directory', 'run directory'))) return files;
  await verifyStateEntry(files.contracts, files.run, 'directory', 'contracts directory');
  await verifyStateEntry(files.amendments, files.run, 'directory', 'amendments directory');
  for (const [label, file] of Object.entries({ brief: files.brief, state: files.state, baseline: files.baseline, evidence: files.evidence, final: files.final, execution: files.execution })) {
    await verifyStateEntry(file, files.run, 'file', `${label} file`);
  }
  return files;
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
  const { root } = await verifiedStateRoot(cwd, { create: true }); const lockFile = path.join(root, 'writer.lock');
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

function transitionHash(transition) { return hashWithout(transition, 'transitionSha256'); }
function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function transitionTargetAllowed(operation, runId, relative) {
  const run = `.pinmind/runs/${runId}`;
  const exact = {
    init: new Set([`${run}/brief.md`, `${run}/state.json`, `${run}/evidence.json`, '.pinmind/active.json']),
    freeze: new Set([`${run}/contracts/contract-v001.json`, `${run}/state.json`]),
    evidence: new Set([`${run}/evidence.json`]),
    finalize: new Set([`${run}/final.md`, `${run}/state.json`, '.pinmind/active.json']),
  };
  if (exact[operation]?.has(relative)) return true;
  if (operation !== 'amend') return false;
  return relative === `${run}/evidence.json` || relative === `${run}/state.json`
    || (relative.startsWith(`${run}/contracts/`) && /^contract-v\d{3,}\.json$/.test(relative.slice(`${run}/contracts/`.length)))
    || (relative.startsWith(`${run}/amendments/`) && /^amendment-v\d{3,}\.json$/.test(relative.slice(`${run}/amendments/`.length)));
}
async function verifyPhysicalParentChain(workspace, target) {
  const relative = path.relative(workspace, path.dirname(target));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new KernelError('Transition target parent escapes the workspace.', 'TRANSITION_CONFLICT');
  let current = workspace;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment); const entry = await existingEntry(current, 'transition target parent');
    if (!entry) return;
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new KernelError('Transition target parent must be a physical directory.', 'TRANSITION_CONFLICT', [path.relative(workspace, current).replace(/\\/g, '/')]);
  }
}
async function transitionTargetState(workspace, action) {
  const absolute = path.resolve(workspace, action.path); const relative = path.relative(workspace, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new KernelError('Transition target escapes the workspace.', 'TRANSITION_CONFLICT');
  await verifyPhysicalParentChain(workspace, absolute);
  const entry = await existingEntry(absolute, 'transition target');
  if (entry && (entry.isSymbolicLink() || !entry.isFile())) throw new KernelError('Transition target must be a physical file.', 'TRANSITION_CONFLICT', [action.path]);
  const content = entry ? await readFile(absolute, 'utf8') : null; const currentSha256 = content === null ? null : sha256(content);
  const matchesBefore = currentSha256 === action.beforeSha256; const matchesAfter = currentSha256 === action.afterSha256;
  return { absolute, currentSha256, matchesBefore, matchesAfter };
}
function validateTransitionShape(transition) {
  const errors = [];
  if (!transition || transition.format !== FORMAT || typeof transition.transitionId !== 'string') errors.push('invalid transition header');
  if (!TRANSITION_OPERATIONS.has(transition?.operation)) errors.push('invalid transition operation');
  try { safeRunId(transition?.runId); } catch { errors.push('invalid transition run id'); }
  if (!Array.isArray(transition?.actions) || transition.actions.length === 0) errors.push('transition actions are required');
  const seen = new Set();
  for (const action of transition?.actions || []) {
    if (!action || typeof action.path !== 'string' || seen.has(action.path)) errors.push('transition target paths must be unique strings');
    seen.add(action?.path);
    if (!transitionTargetAllowed(transition.operation, transition.runId, action.path)) errors.push(`transition target is not allowed: ${action?.path}`);
    if (action.beforeSha256 !== null && !/^[a-f0-9]{64}$/.test(action.beforeSha256 || '')) errors.push(`invalid before hash: ${action?.path}`);
    if (action.afterSha256 !== null && !/^[a-f0-9]{64}$/.test(action.afterSha256 || '')) errors.push(`invalid after hash: ${action?.path}`);
    if (action.afterContent !== null && typeof action.afterContent !== 'string') errors.push(`invalid post-image: ${action?.path}`);
    if ((action.afterContent === null ? null : sha256(action.afterContent)) !== action.afterSha256) errors.push(`post-image hash mismatch: ${action?.path}`);
  }
  if (typeof transition?.transitionSha256 !== 'string' || transitionHash(transition) !== transition.transitionSha256) errors.push('transition hash mismatch');
  return errors;
}
async function inspectPendingTransition(cwd) {
  const stateRoot = await verifiedStateRoot(cwd); const file = path.join(stateRoot.root, 'transition.json');
  if (!stateRoot.exists || !(await exists(file))) return null;
  let transition;
  try { transition = await readJson(file, 'Transition journal'); }
  catch (error) { return { classification: 'transition-conflict', issues: [error.code || 'INVALID_JSON'], transition: null, summary: null }; }
  const errors = validateTransitionShape(transition);
  if (errors.length) return { classification: 'transition-conflict', issues: errors, transition, summary: { transitionId: transition.transitionId ?? null, operation: transition.operation ?? null, runId: transition.runId ?? null, transitionSha256: transition.transitionSha256 ?? null } };
  const states = [];
  try { for (const action of transition.actions) states.push(await transitionTargetState(stateRoot.workspace, action)); }
  catch (error) { return { classification: 'transition-conflict', issues: [error.message], transition, summary: { transitionId: transition.transitionId, operation: transition.operation, runId: transition.runId, transitionSha256: transition.transitionSha256 } }; }
  const conflicts = transition.actions.filter((action, index) => !states[index].matchesBefore && !states[index].matchesAfter).map((action) => action.path);
  return {
    classification: conflicts.length ? 'transition-conflict' : 'transition-recovery-required',
    issues: conflicts.map((target) => `unexpected target hash: ${target}`), transition,
    summary: { transitionId: transition.transitionId, operation: transition.operation, runId: transition.runId, transitionSha256: transition.transitionSha256, applied: states.filter((state) => state.matchesAfter).length, total: states.length },
  };
}
async function inspectWriterLockForRecovery(cwd) {
  const stateRoot = await verifiedStateRoot(cwd); const lockFile = path.join(stateRoot.root, 'writer.lock');
  if (!stateRoot.exists || !(await exists(lockFile))) return { status: 'absent', lockSha256: null };
  const raw = await readFile(lockFile, 'utf8'); const lockSha256 = sha256(raw); let lock;
  try { lock = JSON.parse(raw); }
  catch { return { status: 'invalid', lockSha256 }; }
  if (lock?.format !== FORMAT || typeof lock.ownerId !== 'string' || !Number.isInteger(lock.pid) || lock.pid < 1 || typeof lock.hostname !== 'string' || typeof lock.operation !== 'string') return { status: 'invalid', lockSha256 };
  const summary = { status: 'held', lockSha256, ownerId: lock.ownerId, pid: lock.pid, hostname: lock.hostname, operation: lock.operation };
  if (lock.hostname !== hostname()) return { ...summary, status: 'foreign' };
  try { process.kill(lock.pid, 0); return summary; }
  catch (error) {
    if (error.code === 'ESRCH') return { ...summary, status: 'stale-local' };
    return summary;
  }
}
function transitionMatchesLock(transition, lock) {
  const expected = {
    init: [`init:${transition.runId}`], freeze: [`freeze-contract:${transition.runId}`], amend: [`amend-contract:${transition.runId}`],
    evidence: [`record-evidence:${transition.runId}`, `capture-evidence:${transition.runId}`], finalize: [`finalize:${transition.runId}`],
  };
  return (expected[transition.operation] || []).includes(lock.operation);
}
async function recoverExactStaleLock(cwd, pending, expectedLockSha256) {
  if (typeof expectedLockSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedLockSha256)) throw new KernelError('An exact expected writer-lock hash is required.', 'EXPECTED_LOCK_HASH_REQUIRED');
  const lock = await inspectWriterLockForRecovery(cwd);
  if (lock.lockSha256 !== expectedLockSha256) throw new KernelError('The writer lock changed after inspection.', 'LOCK_HASH_MISMATCH');
  if (lock.status !== 'stale-local') throw new KernelError('Only an explicitly matched dead local writer lock can be recovered.', 'LOCK_NOT_RECOVERABLE', [lock.status]);
  if (!transitionMatchesLock(pending.transition, lock)) throw new KernelError('The stale writer lock does not own the prepared transition.', 'LOCK_TRANSITION_MISMATCH');
  const stateRoot = await verifiedStateRoot(cwd); const lockFile = path.join(stateRoot.root, 'writer.lock');
  if (sha256(await readFile(lockFile, 'utf8')) !== expectedLockSha256) throw new KernelError('The writer lock changed before removal.', 'LOCK_HASH_MISMATCH');
  await unlinkDurable(lockFile); return lock;
}
async function buildTransition(cwd, operation, runId, changes) {
  const stateRoot = await verifiedStateRoot(cwd, { create: true }); const actions = [];
  for (const change of changes) {
    const absolute = path.resolve(change.file); const relative = path.relative(stateRoot.workspace, absolute).replace(/\\/g, '/');
    if (!transitionTargetAllowed(operation, runId, relative)) throw new KernelError('Transition target is outside the operation allowlist.', 'TRANSITION_TARGET_FORBIDDEN', [relative]);
    const current = await existingEntry(absolute, 'transition target');
    if (current && (current.isSymbolicLink() || !current.isFile())) throw new KernelError('Transition target must be a physical file.', 'TRANSITION_CONFLICT', [relative]);
    const beforeContent = current ? await readFile(absolute, 'utf8') : null; const afterContent = change.content;
    actions.push({ path: relative, beforeSha256: beforeContent === null ? null : sha256(beforeContent), afterSha256: afterContent === null ? null : sha256(afterContent), afterContent });
  }
  const now = new Date().toISOString();
  const transition = { format: FORMAT, transitionId: randomUUID(), operation, runId, createdAt: now, actions };
  transition.transitionSha256 = transitionHash(transition); return { stateRoot, transition };
}
async function maybeInjectTransitionFault(options, step) {
  if (typeof options?.onTransitionStep === 'function') await options.onTransitionStep(step);
  if (options?.faultAfterStep === step) throw new KernelError(`Injected transition interruption after step ${step}.`, 'INJECTED_TRANSITION_CRASH', [step]);
}
async function applyTransitionActions(workspace, transition, options = {}) {
  for (let index = 0; index < transition.actions.length; index += 1) {
    const action = transition.actions[index]; const state = await transitionTargetState(workspace, action);
    if (!state.matchesAfter) {
      if (!state.matchesBefore) throw new KernelError('A transition target changed outside its prepared before/after states.', 'TRANSITION_CONFLICT', [action.path]);
      if (action.afterContent === null) await unlinkDurable(state.absolute); else await writeTextAtomic(state.absolute, action.afterContent);
    }
    await maybeInjectTransitionFault(options, index + 1);
  }
}
async function executeTransition(cwd, operation, runId, changes, options = {}) {
  const pending = await inspectPendingTransition(cwd);
  if (pending) throw new KernelError('A prepared transition requires explicit recovery before another mutation.', 'TRANSITION_RECOVERY_REQUIRED', [pending.summary || pending.issues]);
  const { stateRoot, transition } = await buildTransition(cwd, operation, runId, changes);
  const journal = path.join(stateRoot.root, 'transition.json'); await writeJsonAtomic(journal, transition); await maybeInjectTransitionFault(options, 0);
  await applyTransitionActions(stateRoot.workspace, transition, options);
  for (const action of transition.actions) if (!(await transitionTargetState(stateRoot.workspace, action)).matchesAfter) throw new KernelError('Transition post-image verification failed.', 'TRANSITION_CONFLICT', [action.path]);
  await unlinkDurable(journal);
  return { transitionId: transition.transitionId, transitionSha256: transition.transitionSha256 };
}

export async function recoverTransition(cwd, expectedTransitionSha256, options = {}) {
  if (typeof expectedTransitionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedTransitionSha256)) throw new KernelError('An exact expected transition hash is required.', 'EXPECTED_TRANSITION_HASH_REQUIRED');
  const preflight = await inspectPendingTransition(cwd);
  if (preflight?.classification === 'transition-recovery-required' && preflight.transition.transitionSha256 !== expectedTransitionSha256) throw new KernelError('The prepared transition hash changed.', 'TRANSITION_HASH_MISMATCH');
  if (options.expectedLockSha256 !== undefined) {
    if (!preflight || preflight.classification !== 'transition-recovery-required') throw new KernelError('No recoverable prepared transition owns the stale lock.', 'TRANSITION_CONFLICT', preflight?.issues || []);
    await recoverExactStaleLock(cwd, preflight, options.expectedLockSha256);
  }
  return withWorkspaceLock(cwd, 'recover-transition', async () => {
    const pending = await inspectPendingTransition(cwd);
    if (!pending) throw new KernelError('No prepared transition exists.', 'NO_PENDING_TRANSITION');
    if (pending.classification !== 'transition-recovery-required') throw new KernelError('The prepared transition conflicts with current state.', 'TRANSITION_CONFLICT', pending.issues);
    if (pending.transition.transitionSha256 !== expectedTransitionSha256) throw new KernelError('The prepared transition hash changed.', 'TRANSITION_HASH_MISMATCH');
    const stateRoot = await verifiedStateRoot(cwd); await applyTransitionActions(stateRoot.workspace, pending.transition);
    for (const action of pending.transition.actions) if (!(await transitionTargetState(stateRoot.workspace, action)).matchesAfter) throw new KernelError('Transition recovery post-image verification failed.', 'TRANSITION_CONFLICT', [action.path]);
    await unlinkDurable(path.join(stateRoot.root, 'transition.json'));
    const reconciliation = await reconcileActiveRuns(cwd);
    if (!reconciliation.ok) throw new KernelError('Transition applied but active-run reconciliation is not valid.', 'ACTIVE_RUN_INCONSISTENT', [reconciliation]);
    return { recovered: true, transitionId: pending.transition.transitionId, operation: pending.transition.operation, runId: pending.transition.runId, reconciliation };
  });
}

function stateHash(state) { return hashWithout(state, 'stateSha256'); }
function setStateHash(state) { state.stateSha256 = stateHash(state); return state; }

export async function loadState(cwd, runId) {
  const files = await verifiedLayout(cwd, runId);
  const state = await readJson(files.state, 'Run state');
  if (state.format !== FORMAT || state.runId !== runId || typeof state.stateSha256 !== 'string' || stateHash(state) !== state.stateSha256) {
    throw new KernelError(`Run state is corrupt: ${runId}`, 'CORRUPT_STATE');
  }
  return { files, state };
}

function requireActiveRun(state, runId) { if (state.status !== 'active') throw new KernelError(`Run ${runId} is complete.`, 'RUN_COMPLETE'); }

function reconciliationResult(classification, pointerRunId, activeRunIds, runIds, issues = [], pendingTransition = null) {
  const ok = classification === 'clean-idle' || classification === 'canonical-active';
  const nextSafeSteps = {
    'clean-idle': 'No recovery action is required.',
    'canonical-active': `Resume only ${pointerRunId}; this diagnostic did not execute or replay task work.`,
    'orphan-active': 'Inspect the orphan run and restore a canonical pointer only through a future explicitly authorized repair.',
    'split-brain': 'Stop writers and inspect every listed active run; do not choose or rewrite an owner automatically.',
    'pointer-nonactive': 'Inspect the interrupted finalization boundary; do not delete the pointer automatically.',
    'pointer-missing-run': 'Inspect the pointer and workspace history; the referenced run is missing.',
    'pointer-diverged': 'Inspect the pointer and active run states; ownership is inconsistent.',
    'pointer-invalid': 'Inspect the invalid active pointer without replacing it automatically.',
    'run-corrupt': 'Inspect the listed managed run entries; reconciliation cannot trust corrupted state.',
    'transition-recovery-required': 'Run explicit hash-bound state recovery; this diagnostic did not apply post-images or replay task work.',
    'transition-conflict': 'Inspect the transition and target hashes; do not overwrite or delete the journal automatically.',
  };
  return { ok, classification, pointerRunId, activeRunIds, managedRunCount: runIds.length, issues, pendingTransition, nextSafeStep: nextSafeSteps[classification] };
}

export async function reconcileActiveRuns(cwd) {
  const stateRoot = await verifiedStateRoot(cwd);
  if (!stateRoot.exists) return reconciliationResult('clean-idle', null, [], []);
  const pending = await inspectPendingTransition(cwd);
  if (pending) {
    const result = reconciliationResult(pending.classification, null, [], [], pending.issues, pending.summary);
    result.writerLock = await inspectWriterLockForRecovery(cwd);
    if (result.writerLock.status === 'stale-local' && pending.classification === 'transition-recovery-required') result.nextSafeStep = 'Use explicit state recovery with both the printed transition hash and dead local writer-lock hash; no task work will be replayed.';
    return result;
  }
  const runsPath = path.join(stateRoot.root, 'runs');
  const hasRuns = await verifyStateEntry(runsPath, stateRoot.root, 'directory', 'runs directory');
  const runIds = []; const activeRunIds = []; const issues = [];
  if (hasRuns) {
    const entries = (await readdir(runsPath, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        issues.push(`${entry.name}: expected a physical run directory`);
        continue;
      }
      let runId;
      try { runId = safeRunId(entry.name); }
      catch { issues.push(`${entry.name}: invalid run id`); continue; }
      runIds.push(runId);
      try {
        const { state } = await loadState(cwd, runId);
        if (state.status === 'active') activeRunIds.push(runId);
      } catch (error) {
        if (error.code === 'UNSAFE_STATE_PATH') throw error;
        issues.push(`${runId}: ${error.code || 'INVALID_STATE'}`);
      }
    }
  }
  runIds.sort(); activeRunIds.sort();

  const activePath = path.join(stateRoot.root, 'active.json');
  let pointerRunId = null; let pointerInvalid = false;
  if (await exists(activePath)) {
    try {
      const pointer = await readJson(activePath, 'Active run pointer');
      if (pointer.format !== FORMAT) pointerInvalid = true;
      else pointerRunId = safeRunId(pointer.runId);
    } catch (error) {
      if (error.code === 'UNSAFE_STATE_PATH') throw error;
      pointerInvalid = true;
    }
  }

  if (issues.length) return reconciliationResult('run-corrupt', pointerRunId, activeRunIds, runIds, issues);
  if (activeRunIds.length > 1) return reconciliationResult('split-brain', pointerRunId, activeRunIds, runIds);
  if (pointerInvalid) return reconciliationResult('pointer-invalid', null, activeRunIds, runIds);
  if (!pointerRunId) return activeRunIds.length === 0
    ? reconciliationResult('clean-idle', null, activeRunIds, runIds)
    : reconciliationResult('orphan-active', null, activeRunIds, runIds);
  if (!runIds.includes(pointerRunId)) return reconciliationResult('pointer-missing-run', pointerRunId, activeRunIds, runIds);
  if (activeRunIds.length === 0) return reconciliationResult('pointer-nonactive', pointerRunId, activeRunIds, runIds);
  if (activeRunIds[0] !== pointerRunId) return reconciliationResult('pointer-diverged', pointerRunId, activeRunIds, runIds);
  return reconciliationResult('canonical-active', pointerRunId, activeRunIds, runIds);
}

async function requireCanonicalActiveRun(cwd, state, runId) {
  requireActiveRun(state, runId);
  const reconciliation = await reconcileActiveRuns(cwd);
  if (!reconciliation.ok || reconciliation.classification !== 'canonical-active') {
    throw new KernelError('The active-run state is inconsistent and requires read-only reconciliation.', 'ACTIVE_RUN_INCONSISTENT', [reconciliation.classification, ...reconciliation.activeRunIds]);
  }
  if (reconciliation.pointerRunId !== runId) throw new KernelError(`Run ${runId} is not the canonical active run.`, 'NOT_ACTIVE_RUN');
  return reconciliation;
}

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
    await verifyStateEntry(file, files.contracts, 'file', `contract v${version}`);
    const contract = await readJson(file, 'Frozen contract');
    if (contract.contractSha256 !== expectedHash || hashWithout(contract, 'contractSha256') !== expectedHash) throw new KernelError(`Frozen contract v${version} was changed.`, 'FROZEN_CONTRACT_CHANGED');
  }
  return { files, state };
}

async function initRunUnlocked(cwd, runId, briefText, options = {}) {
  const files = await verifiedLayout(cwd, runId, { createRoot: true });
  if (await exists(files.run)) throw new KernelError(`Run already exists: ${runId}`, 'RUN_EXISTS');
  const reconciliation = await reconcileActiveRuns(cwd);
  if (reconciliation.classification === 'canonical-active') throw new KernelError(`An active run already exists: ${reconciliation.pointerRunId}`, 'ACTIVE_RUN_EXISTS');
  if (reconciliation.classification !== 'clean-idle') throw new KernelError('The active-run state is inconsistent and must be reconciled before initialization.', 'ACTIVE_RUN_INCONSISTENT', [reconciliation.classification, ...reconciliation.activeRunIds]);
  if (typeof briefText !== 'string' || !briefText.trim()) throw new KernelError('briefText is required.', 'INVALID_BRIEF');
  const brief = redact(briefText);
  const now = new Date().toISOString();
  const state = setStateHash({ format: FORMAT, runId, status: 'active', phase: 'understand', baselineRequired: true, briefSha256: sha256(brief), contractHashes: {}, currentContractVersion: null, createdAt: now, updatedAt: now });
  const evidence = { format: FORMAT, entries: [] }; evidence.storeSha256 = evidenceStoreHash(evidence);
  await executeTransition(cwd, 'init', runId, [
    { file: files.brief, content: brief },
    { file: files.state, content: jsonText(state) },
    { file: files.evidence, content: jsonText(evidence) },
    { file: files.active, content: jsonText({ format: FORMAT, runId, updatedAt: now }) },
  ], options);
  return { runId, briefSha256: state.briefSha256 };
}

export async function initRun(cwd, runId, briefText, options = {}) {
  return withWorkspaceLock(cwd, `init:${safeRunId(runId)}`, () => initRunUnlocked(cwd, runId, briefText, options));
}

async function currentContract(files, state) {
  if (!state.currentContractVersion) throw new KernelError('No frozen contract exists.', 'NO_CONTRACT');
  const version = state.currentContractVersion;
  const file = path.join(files.contracts, `contract-v${String(version).padStart(3, '0')}.json`);
  await verifyStateEntry(file, files.contracts, 'file', `contract v${version}`);
  return readJson(file, 'Frozen contract');
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

async function freezeContractUnlocked(cwd, runId, candidate, options = {}) {
  const { files, state } = await verifyRun(cwd, runId);
  await requireCanonicalActiveRun(cwd, state, runId);
  if (state.baselineRequired === true) {
    if (!(await exists(files.baseline))) throw new KernelError('Record an explicit baseline before freezing a new run.', 'BASELINE_REQUIRED');
    await loadBaseline(files);
  }
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
  const nextState = structuredClone(state); nextState.currentContractVersion = 1; nextState.contractHashes['1'] = contract.contractSha256; nextState.phase = 'execute'; nextState.updatedAt = new Date().toISOString(); setStateHash(nextState);
  await executeTransition(cwd, 'freeze', runId, [{ file: output, content: jsonText(contract) }, { file: files.state, content: jsonText(nextState) }], options);
  return { version: 1, contractSha256: contract.contractSha256, path: output };
}

export async function freezeContract(cwd, runId, candidate, options = {}) {
  return withWorkspaceLock(cwd, `freeze-contract:${safeRunId(runId)}`, () => freezeContractUnlocked(cwd, runId, candidate, options));
}

async function amendContractUnlocked(cwd, runId, candidate, reason, affected, authority, options = {}) {
  const { files, state } = await verifyRun(cwd, runId);
  await requireCanonicalActiveRun(cwd, state, runId);
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
  const evidence = await loadEvidence(files);
  const now = new Date().toISOString();
  const targets = invalidationTargets(previous, changes);
  for (const entry of evidence.entries || []) if (entry.contractVersion === previous.version && (targets === null || (entry.covers || []).some((id) => targets.has(id)))) {
    entry.status = 'invalidated'; entry.invalidatedAt = now; entry.invalidatedBy = `contract-v${version}`;
  }
  evidence.storeSha256 = evidenceStoreHash(evidence);
  const amendment = { format: FORMAT, fromVersion: previous.version, toVersion: version, reason: redact(reason), authority: redact(authority), affected: [...suppliedTokens], changes, createdAt: now };
  const nextState = structuredClone(state); nextState.currentContractVersion = version; nextState.contractHashes[String(version)] = contract.contractSha256; nextState.phase = 'execute'; nextState.updatedAt = now; setStateHash(nextState);
  await executeTransition(cwd, 'amend', runId, [
    { file: path.join(files.contracts, `contract-v${String(version).padStart(3, '0')}.json`), content: jsonText(contract) },
    { file: files.evidence, content: jsonText(evidence) },
    { file: path.join(files.amendments, `amendment-v${String(version).padStart(3, '0')}.json`), content: jsonText(amendment) },
    { file: files.state, content: jsonText(nextState) },
  ], options);
  return { version, changes: [...actualTokens], invalidatedEvidence: (evidence.entries || []).filter((entry) => entry.status === 'invalidated' && entry.invalidatedBy === `contract-v${version}`).map((entry) => entry.evidenceId) };
}

export async function amendContract(cwd, runId, candidate, reason, affected, authority, options = {}) {
  return withWorkspaceLock(cwd, `amend-contract:${safeRunId(runId)}`, () => amendContractUnlocked(cwd, runId, candidate, reason, affected, authority, options));
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
function nonEmptyText(value) { return typeof value === 'string' && value.trim().length > 0; }

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
async function assessWorkspaceFingerprint(cwd, fingerprint) {
  if (!fingerprint || fingerprint.status !== 'current' || !Array.isArray(fingerprint.paths) || typeof fingerprint.fingerprintSha256 !== 'string') return { status: 'unavailable', reason: fingerprint?.reason || 'No trustworthy workspace fingerprint was captured.' };
  const current = await workspaceFingerprint(cwd, fingerprint.paths);
  if (current.status !== 'current') return { status: 'unavailable', reason: current.reason };
  return current.fingerprintSha256 === fingerprint.fingerprintSha256
    ? { status: 'current' }
    : { status: 'stale', reason: 'One or more declared freshness paths changed after capture.' };
}

function baselineHash(receipt) { return hashWithout(receipt, 'baselineSha256'); }
async function loadBaseline(files) {
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
  await requireCanonicalActiveRun(cwd, state, runId);
  const currentExecutionSha256 = await fileSha256OrNull(files.execution);
  if (expectedExecutionSha256 !== undefined && currentExecutionSha256 !== expectedExecutionSha256) throw new KernelError('Execution view changed after the caller snapshot.', 'STALE_EXECUTION');
  if (!result.ok) throw new KernelError('Execution validation failed.', 'INVALID_EXECUTION', result.errors);
  await writeJsonAtomic(files.execution, redactValue(execution)); return { ...result, executionSha256: await fileSha256OrNull(files.execution) };
}

export async function validateAndSaveExecution(cwd, runId, execution, options = {}) {
  const files = await verifiedLayout(cwd, safeRunId(runId));
  const expectedExecutionSha256 = Object.prototype.hasOwnProperty.call(options, 'expectedExecutionSha256') ? options.expectedExecutionSha256 : await fileSha256OrNull(files.execution);
  if (expectedExecutionSha256 !== null && (typeof expectedExecutionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedExecutionSha256))) throw new KernelError('expectedExecutionSha256 must identify the caller snapshot or be null.', 'INVALID_EXECUTION');
  return withWorkspaceLock(cwd, `save-execution:${safeRunId(runId)}`, () => validateAndSaveExecutionUnlocked(cwd, runId, execution, expectedExecutionSha256));
}

export async function stateShow(cwd, requestedRunId) {
  let runId = requestedRunId;
  if (!runId) {
    const { root } = await verifiedStateRoot(cwd); const activePath = path.join(root, 'active.json');
    if (!(await exists(activePath))) throw new KernelError('There is no active run.', 'NO_ACTIVE_RUN');
    const active = await readJson(activePath, 'Active run pointer'); runId = active.runId;
  }
  const verified = await verifyRun(cwd, safeRunId(runId));
  return { runId, status: verified.state.status, phase: verified.state.phase, currentContractVersion: verified.state.currentContractVersion, updatedAt: verified.state.updatedAt };
}

export async function stateResume(cwd, requestedRunId) {
  const reconciliation = await reconcileActiveRuns(cwd);
  if (reconciliation.classification === 'clean-idle') {
    if (requestedRunId) {
      const summary = await stateShow(cwd, requestedRunId);
      if (summary.status !== 'active') throw new KernelError(`Run ${summary.runId} is complete.`, 'RUN_COMPLETE');
    }
    throw new KernelError('There is no active run.', 'NO_ACTIVE_RUN');
  }
  if (!reconciliation.ok || reconciliation.classification !== 'canonical-active') throw new KernelError('The active-run state is inconsistent and requires read-only reconciliation.', 'ACTIVE_RUN_INCONSISTENT', [reconciliation.classification, ...reconciliation.activeRunIds]);
  if (requestedRunId && safeRunId(requestedRunId) !== reconciliation.pointerRunId) throw new KernelError(`Run ${requestedRunId} is not the canonical active run.`, 'NOT_ACTIVE_RUN');
  const summary = await stateShow(cwd, reconciliation.pointerRunId);
  return { ...summary, resumePhase: summary.phase, message: `Resume ${summary.runId} at ${summary.phase}.` };
}

function remainingBoundariesForReport(contract) {
  return {
    assumptions: Array.isArray(contract?.assumptions) ? [...contract.assumptions] : [],
    outOfScope: Array.isArray(contract?.outOfScope) ? [...contract.outOfScope] : [],
  };
}
function renderRemainingBoundaries(boundaries) {
  const line = (value) => String(value).replace(/\s+/g, ' ').trim();
  const assumptions = boundaries.assumptions.length ? boundaries.assumptions.map((item) => `- ${line(item)}`).join('\n') : '- none';
  const outOfScope = boundaries.outOfScope.length ? boundaries.outOfScope.map((item) => `- ${line(item)}`).join('\n') : '- none';
  return `## Remaining boundaries\n\n### Assumptions requiring observation\n${assumptions}\n\n### Out of scope or deferred\n${outOfScope}`;
}

export async function reportRun(cwd, runId, format = 'json') {
  const { files, state } = await verifyRun(cwd, safeRunId(runId));
  const contract = state.currentContractVersion ? await currentContract(files, state) : null;
  const evidence = await loadEvidence(files); const currentEntries = (evidence.entries || []).filter((entry) => entry.contractVersion === state.currentContractVersion);
  const statuses = ['pass', 'fail', 'uncertain', 'pending-review', 'not-applicable'];
  const counts = Object.fromEntries(statuses.map((status) => [status, currentEntries.filter((entry) => entry.status === status).length]));
  const baseline = await loadBaseline(files);
  const remainingBoundaries = remainingBoundariesForReport(contract);
  const summary = { format: FORMAT, runId, status: state.status, phase: state.phase, contract: contract ? { contractId: contract.contractId, version: state.currentContractVersion } : null, baseline: { status: baseline.status, observed: baseline.observed ?? null, reason: baseline.reason ?? null, capturedAt: baseline.capturedAt ?? null }, evidence: { total: currentEntries.length, counts }, remainingBoundaries, updatedAt: state.updatedAt };
  if (format === 'json') return summary;
  if (format !== 'md' && format !== 'markdown') throw new KernelError('Report format must be json or md.', 'INVALID_REPORT_FORMAT');
  const contractLine = contract ? `${contract.contractId} v${state.currentContractVersion}` : 'not frozen';
  return `# Pinmind run report\n\n- Run: ${runId}\n- Status: ${state.status}\n- Phase: ${state.phase}\n- Contract: ${contractLine}\n- Baseline: ${baseline.status}\n- Evidence: ${counts.pass}/${currentEntries.length} passing\n\n${renderRemainingBoundaries(remainingBoundaries)}\n`;
}

async function trustworthyPassingEvidence(cwd, entry, criticalTargets = new Set()) {
  if (entry.status !== 'pass') return { trustworthy: false, freshness: 'unavailable' };
  if (entry.provenance?.kind === 'manual-attestation') return { trustworthy: !(entry.covers || []).some((id) => criticalTargets.has(id)) && nonEmptyText(entry.procedure) && !nonEmptyText(entry.command), freshness: 'unavailable' };
  if (entry.provenance?.kind !== 'captured-command') return { trustworthy: false, freshness: 'unavailable' };
  const captured = entry.provenance;
  if (captured.exitCode !== 0 || !Array.isArray(captured.argv) || captured.argv.length === 0 || !nonEmptyText(captured.capturedAt)) return { trustworthy: false, freshness: 'unavailable' };
  let artifactCurrent = false;
  if (nonEmptyText(entry.artifact)) {
    const relative = safeRelativePath(entry.artifact, 'artifact'); const expected = captured.artifactHashes?.[relative];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return { trustworthy: false, freshness: 'unavailable' };
    try { const artifact = await resolveContainedExisting(cwd, relative, 'artifact', 'file'); if (sha256(await readFile(artifact.absolute)) !== expected) return { trustworthy: false, freshness: 'stale' }; artifactCurrent = true; } catch { return { trustworthy: false, freshness: 'stale' }; }
  }
  if (!nonEmptyText(entry.artifact) && !nonEmptyText(entry.reference)) return { trustworthy: false, freshness: 'unavailable' };
  const workspace = await assessWorkspaceFingerprint(cwd, captured.workspaceFingerprint);
  if (workspace.status === 'stale') return { trustworthy: true, freshness: 'stale', reason: workspace.reason };
  if (workspace.status === 'current' || artifactCurrent) return { trustworthy: true, freshness: 'current' };
  return { trustworthy: true, freshness: 'unavailable', reason: workspace.reason };
}

async function finalVerifyUnlocked(cwd, runId) {
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state); const evidenceResult = await validateEvidence(cwd, runId); const errors = [...evidenceResult.errors];
  if (state.baselineRequired === true && !(await exists(files.baseline))) errors.push('Run requires an explicit baseline receipt.');
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
    const targetDefinition = targetsById.get(target); const requiresFreshness = targetDefinition?.freshnessRequired === true;
    for (const evidenceId of targetDefinition?.evidence || []) {
      const matches = entries.filter((entry) => entry.contractVersion === state.currentContractVersion && entry.evidenceId === evidenceId && (entry.covers || []).includes(target));
      const assessments = await Promise.all(matches.map((entry) => trustworthyPassingEvidence(cwd, entry, criticalTargets)));
      if (!assessments.some((item) => item.trustworthy && (!requiresFreshness || item.freshness === 'current'))) {
        const freshness = assessments.find((item) => item.trustworthy)?.freshness;
        errors.push(freshness && requiresFreshness ? `${target} has ${freshness} freshness for planned ${evidenceId}.` : `${target} lacks trustworthy passing evidence for planned ${evidenceId}.`);
      }
    }
  }
  if (await exists(files.execution)) {
    const execution = await readJson(files.execution, 'Execution view'); const executionResult = validateExecution(execution, contract); errors.push(...executionResult.errors);
  }
  const baseline = await loadBaseline(files);
  return { ok: errors.length === 0, verdict: errors.length === 0 ? 'pass' : 'fail', runId, contractVersion: state.currentContractVersion, baseline: { status: baseline.status, observed: baseline.observed ?? null, reason: baseline.reason ?? null }, errors };
}

export async function finalVerify(cwd, runId) { return finalVerifyUnlocked(cwd, runId); }

async function finalizeRunUnlocked(cwd, runId, verification, options = {}) {
  if (!verification?.ok) throw new KernelError('Cannot finalize a failed verification.', 'FINAL_GATE_FAILED', verification?.errors || []);
  verification = await finalVerifyUnlocked(cwd, runId);
  if (!verification.ok) throw new KernelError('Final verification changed before commit.', 'FINAL_GATE_FAILED', verification.errors);
  const { files, state } = await verifyRun(cwd, runId); const contract = await currentContract(files, state); const evidence = await loadEvidence(files);
  await requireCanonicalActiveRun(cwd, state, runId);
  const baseline = await loadBaseline(files);
  const currentEntries = evidence.entries.filter((entry) => entry.contractVersion === state.currentContractVersion);
  const passed = currentEntries.filter((entry) => entry.status === 'pass').length;
  const statuses = ['pass', 'fail', 'uncertain', 'pending-review', 'not-applicable'];
  const counts = statuses.map((status) => `- ${status}: ${currentEntries.filter((entry) => entry.status === status).length}`).join('\n');
  const attention = statuses.slice(1).map((status) => `- ${status}: ${currentEntries.filter((entry) => entry.status === status).map((entry) => entry.evidenceId).join(', ') || 'none'}`).join('\n');
  const manual = currentEntries.filter((entry) => entry.provenance?.kind === 'manual-attestation').map((entry) => entry.evidenceId).join(', ') || 'none';
  const captured = currentEntries.filter((entry) => entry.provenance?.kind === 'captured-command').map((entry) => entry.evidenceId).join(', ') || 'none';
  const completionBasis = manual === 'none' ? 'machine-captured evidence' : 'mixed machine-captured and manual/unreplayed evidence';
  const remainingBoundaries = remainingBoundariesForReport(contract);
  const report = `# Pinmind final report\n\n- Run: ${runId}\n- Contract: ${contract.contractId} v${state.currentContractVersion}\n- Baseline: ${baseline.status}\n- Evidence: ${passed}/${currentEntries.length} passing\n\n## Evidence status counts\n${counts}\n\n## Current evidence requiring attention\n${attention}\n\n## Evidence provenance\n- machine-captured: ${captured}\n- manual/unreplayed: ${manual}\n\n${renderRemainingBoundaries(remainingBoundaries)}\n\n- MUST evidence coverage: satisfied\n- Completion basis: ${completionBasis}\n- Replay note: stored commands were verified for captured provenance and artifact integrity, but were not replayed during finalization\n`;
  const nextState = structuredClone(state); nextState.phase = 'finalize'; nextState.status = 'complete'; nextState.updatedAt = new Date().toISOString(); setStateHash(nextState);
  const changes = [{ file: files.final, content: report }, { file: files.state, content: jsonText(nextState) }, { file: files.active, content: null }];
  await executeTransition(cwd, 'finalize', runId, changes, options);
  return { ...verification, finalized: true, finalPath: files.final };
}

export async function finalizeRun(cwd, runId, verification, options = {}) {
  return withWorkspaceLock(cwd, `finalize:${safeRunId(runId)}`, () => finalizeRunUnlocked(cwd, runId, verification, options));
}

export async function readInputJson(file) { return readJson(path.resolve(file)); }
const ROUTE_STDIN_MAX_BYTES = 1024 * 1024;
const ROUTE_STDIN_TIMEOUT_MS = 5000;
export async function readRouteInputJson(file, inputStream = process.stdin, options = {}) {
  if (file !== '-') return readInputJson(file);
  const maxBytes = options.maxBytes ?? ROUTE_STDIN_MAX_BYTES; const timeoutMs = options.timeoutMs ?? ROUTE_STDIN_TIMEOUT_MS;
  const timeoutError = new KernelError(`Route standard input did not finish within ${timeoutMs}ms.`, 'ROUTE_INPUT_TIMEOUT');
  let timer; let timedOut = false;
  try {
    const consume = (async () => {
      let input = ''; let bytes = 0;
      inputStream.setEncoding('utf8');
      for await (const chunk of inputStream) {
        bytes += Buffer.byteLength(chunk, 'utf8');
        if (bytes > maxBytes) {
          inputStream.destroy?.();
          throw new KernelError(`Route standard input exceeds ${maxBytes} bytes.`, 'ROUTE_INPUT_TOO_LARGE');
        }
        input += chunk;
      }
      return JSON.parse(input);
    })();
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; inputStream.destroy?.(); reject(timeoutError); }, timeoutMs);
    });
    return await Promise.race([consume, deadline]);
  } catch (error) {
    if (timedOut) throw timeoutError;
    if (error instanceof KernelError) throw error;
    throw new KernelError('Route standard input is unreadable or invalid JSON.', 'INVALID_JSON', [error.message]);
  } finally { clearTimeout(timer); }
}
export async function readBrief(file) { return readFile(path.resolve(file), 'utf8'); }
export function generateRunId() { return `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`; }
