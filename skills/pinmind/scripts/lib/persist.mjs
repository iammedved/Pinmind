import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access, rename, unlink, open, realpath, lstat, readdir } from 'node:fs/promises';
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

export const FORMAT = 1;
const LOCK_WAIT_MS = 5000;
const LOCK_RETRY_MS = 15;
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

export async function exists(file) { try { await access(file); return true; } catch { return false; } }
export async function readJson(file, label = 'JSON file') {
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
export async function writeJsonAtomic(file, value) {
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
export async function writeTextAtomic(file, value) {
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
export async function unlinkDurable(file) { await unlink(file); await syncDirectory(path.dirname(file)); }
export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

export async function existingEntry(candidate, label) {
  try { return await lstat(candidate); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw unsafeStatePath(label, error.message);
  }
}

export async function verifyStateEntry(candidate, boundary, kind, label) {
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

export async function verifiedStateRoot(cwd, { create = false } = {}) {
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

export async function verifiedLayout(cwd, runId, { createRoot = false } = {}) {
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

export async function withWorkspaceLock(cwd, operation, action) {
  const lock = await acquireWorkspaceLock(cwd, operation);
  try { return await action(lock); }
  finally { await releaseWorkspaceLock(lock); }
}

function transitionHash(transition) { return hashWithout(transition, 'transitionSha256'); }
export function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
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
export async function executeTransition(cwd, operation, runId, changes, options = {}) {
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
export function setStateHash(state) { state.stateSha256 = stateHash(state); return state; }

export async function loadState(cwd, runId) {
  const files = await verifiedLayout(cwd, runId);
  const state = await readJson(files.state, 'Run state');
  if (state.format !== FORMAT || state.runId !== runId || typeof state.stateSha256 !== 'string' || stateHash(state) !== state.stateSha256) {
    throw new KernelError(`Run state is corrupt: ${runId}`, 'CORRUPT_STATE');
  }
  return { files, state };
}

export function requireActiveRun(state, runId) { if (state.status !== 'active') throw new KernelError(`Run ${runId} is complete.`, 'RUN_COMPLETE'); }

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

export async function requireCanonicalActiveRun(cwd, state, runId) {
  requireActiveRun(state, runId);
  const reconciliation = await reconcileActiveRuns(cwd);
  if (!reconciliation.ok || reconciliation.classification !== 'canonical-active') {
    throw new KernelError('The active-run state is inconsistent and requires read-only reconciliation.', 'ACTIVE_RUN_INCONSISTENT', [reconciliation.classification, ...reconciliation.activeRunIds]);
  }
  if (reconciliation.pointerRunId !== runId) throw new KernelError(`Run ${runId} is not the canonical active run.`, 'NOT_ACTIVE_RUN');
  return reconciliation;
}

export function ids(items) { return new Set((items || []).map((item) => item.id)); }
export function requireArray(value, label, errors) { if (!Array.isArray(value)) errors.push(`${label} must be an array.`); }
export function validId(value) { return typeof value === 'string' && /^[A-Z][A-Z0-9]*-\d{3,}$/.test(value); }
export function validEvidenceId(value) { return typeof value === 'string' && /^EV-\d{3,}$/.test(value); }
function refsExist(refs, known) { return Array.isArray(refs) && refs.length > 0 && refs.every((id) => known.has(id)); }
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
export async function currentContract(files, state) {
  if (!state.currentContractVersion) throw new KernelError('No frozen contract exists.', 'NO_CONTRACT');
  const version = state.currentContractVersion;
  const file = path.join(files.contracts, `contract-v${String(version).padStart(3, '0')}.json`);
  await verifyStateEntry(file, files.contracts, 'file', `contract v${version}`);
  return readJson(file, 'Frozen contract');
}
export function isPhysicalDescendant(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
