#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KernelError, amendContract, captureBaseline, captureEvidence, finalVerify, finalizeRun, freezeContract, generateRunId, initRun, readBrief, readInputJson, reconcileActiveRuns, recoverTransition,
  recordEvidence, recordUnavailableBaseline, recordUsage, reportRun, routeTask, stateResume, stateShow, validateAndSaveExecution, validateContract, validateEvidence,
} from './lib/core.mjs';

function parse(argv) {
  const positionals = []; const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const name = value.slice(2);
      if (Object.hasOwn(flags, name)) throw new KernelError(`--${name} may be provided only once.`, 'DUPLICATE_FLAG');
      flags[name] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    }
    else positionals.push(value);
  }
  return { positionals, flags };
}
const COMMAND_FLAGS = new Map([
  ['init', ['run', 'brief']], ['route', ['file', 'text', 'kind']], ['state show', ['run']], ['state resume', ['run']], ['state reconcile', ['dry-run']],
  ['state recover', ['apply', 'expected-sha256', 'expected-lock-sha256']], ['report', ['run', 'format']], ['baseline capture', ['run', 'file', 'cwd', 'timeout-ms']],
  ['baseline unavailable', ['run', 'file']], ['contract validate', ['run', 'file']], ['contract freeze', ['run', 'file']], ['contract amend', ['run', 'file', 'reason', 'affects', 'authority']],
  ['execution validate', ['run', 'file']], ['evidence record', ['run', 'file']], ['evidence capture', ['run', 'file', 'cwd', 'timeout-ms']], ['evidence validate', ['run']],
  ['usage record', ['run', 'file']], ['final check', ['run']], ['final verify', ['run']], ['finalize', ['run']],
]);
function validateInvocation(positionals, flags, commandArgv = []) {
  const [group, action, ...extra] = positionals;
  const groupedKey = [group, action].filter(Boolean).join(' ');
  const key = COMMAND_FLAGS.has(group) ? group : COMMAND_FLAGS.has(groupedKey) ? groupedKey : null;
  if (!key) return;
  const allowed = COMMAND_FLAGS.get(key);
  const unknown = Object.keys(flags).filter((name) => !allowed.includes(name));
  if (unknown.length) throw new KernelError(`Unknown flag for ${key}: --${unknown[0]}.`, 'UNKNOWN_FLAG', unknown.map((name) => `--${name}`));
  const unexpected = COMMAND_FLAGS.has(group) ? positionals.slice(1) : extra;
  if (unexpected.length) throw new KernelError(`Unexpected positional argument for ${key}: ${unexpected[0]}.`, 'UNEXPECTED_POSITIONAL', unexpected);
  if (commandArgv.length && key !== 'baseline capture' && key !== 'evidence capture') {
    throw new KernelError(`Unexpected command argument for ${key}: ${commandArgv[0]}.`, 'UNEXPECTED_POSITIONAL', commandArgv);
  }
}
function requireFlag(flags, name) { if (typeof flags[name] !== 'string') throw new KernelError(`--${name} is required.`, 'MISSING_ARGUMENT'); return flags[name]; }
function print(value) { process.stdout.write(typeof value === 'string' ? `${value.replace(/\n?$/, '\n')}` : `${JSON.stringify(value, null, 2)}\n`); }
const usage = 'Usage: pinmind.mjs init|route|contract validate|contract freeze|contract amend|baseline capture --run RUN --file TEMPLATE [--cwd RELATIVE] -- COMMAND [ARGS...]|baseline unavailable --run RUN --file RECEIPT|execution validate|evidence record|evidence capture --run RUN --file TEMPLATE [--cwd RELATIVE] [--timeout-ms 50..300000] -- COMMAND [ARGS...]|evidence validate|usage record|report|state show|state resume|state reconcile --dry-run|state recover --apply --expected-sha256 HASH [--expected-lock-sha256 HASH]|final check|final verify|finalize';
function requirePassing(result, code, message) { if (!result.ok) throw new KernelError(message, code, result.errors); return result; }

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const divider = argv.indexOf('--'); const commandArgv = divider === -1 ? [] : argv.slice(divider + 1); const { positionals, flags } = parse(divider === -1 ? argv : argv.slice(0, divider)); const [group, action] = positionals;
  if (group === '--help' || group === '-h' || !group) return { ok: true, usage };
  validateInvocation(positionals, flags, commandArgv);
  if (group === 'init') { const run = flags.run || generateRunId(); const brief = await readBrief(requireFlag(flags, 'brief')); return initRun(cwd, run, brief); }
  if (group === 'route') return routeTask(flags.file ? await readInputJson(flags.file) : { text: requireFlag(flags, 'text'), kind: flags.kind });
  if (group === 'state' && action === 'show') return stateShow(cwd, flags.run);
  if (group === 'state' && action === 'resume') return stateResume(cwd, flags.run);
  if (group === 'state' && action === 'reconcile') {
    if (flags['dry-run'] !== true) throw new KernelError('state reconcile currently supports only --dry-run.', 'DRY_RUN_REQUIRED');
    const result = await reconcileActiveRuns(cwd);
    if (!result.ok) throw new KernelError('The active-run state is inconsistent.', 'ACTIVE_RUN_INCONSISTENT', [result]);
    return result;
  }
  if (group === 'state' && action === 'recover') {
    if (flags.apply !== true) throw new KernelError('state recover requires explicit --apply authority.', 'APPLY_REQUIRED');
    return recoverTransition(cwd, requireFlag(flags, 'expected-sha256'), typeof flags['expected-lock-sha256'] === 'string' ? { expectedLockSha256: flags['expected-lock-sha256'] } : {});
  }
  const run = requireFlag(flags, 'run');
  if (group === 'report') return reportRun(cwd, run, typeof flags.format === 'string' ? flags.format : 'json');
  if (group === 'baseline' && action === 'capture') return captureBaseline(cwd, run, await readInputJson(requireFlag(flags, 'file')), commandArgv, typeof flags.cwd === 'string' ? flags.cwd : '.', { timeoutMs: flags['timeout-ms'] === undefined ? undefined : Number(flags['timeout-ms']) });
  if (group === 'baseline' && action === 'unavailable') return recordUnavailableBaseline(cwd, run, (await readInputJson(requireFlag(flags, 'file'))).reason);
  if (group === 'contract' && action === 'validate') { const candidate = await readInputJson(requireFlag(flags, 'file')); const result = validateContract(candidate); if (!result.ok) throw new KernelError('Contract validation failed.', 'INVALID_CONTRACT', result.errors); return result; }
  if (group === 'contract' && action === 'freeze') return freezeContract(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'contract' && action === 'amend') return amendContract(cwd, run, await readInputJson(requireFlag(flags, 'file')), requireFlag(flags, 'reason'), requireFlag(flags, 'affects').split(',').map((item) => item.trim()).filter(Boolean), requireFlag(flags, 'authority'));
  if (group === 'execution' && action === 'validate') return validateAndSaveExecution(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'evidence' && action === 'record') return recordEvidence(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'evidence' && action === 'capture') return captureEvidence(cwd, run, await readInputJson(requireFlag(flags, 'file')), commandArgv, typeof flags.cwd === 'string' ? flags.cwd : '.', { timeoutMs: flags['timeout-ms'] === undefined ? undefined : Number(flags['timeout-ms']) });
  if (group === 'evidence' && action === 'validate') return requirePassing(await validateEvidence(cwd, run), 'EVIDENCE_GATE_FAILED', 'Evidence validation gate failed.');
  if (group === 'usage' && action === 'record') return recordUsage(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'final' && action === 'check') return finalVerify(cwd, run);
  if (group === 'final' && action === 'verify') return finalizeRun(cwd, run, requirePassing(await finalVerify(cwd, run), 'FINAL_GATE_FAILED', 'Final verification gate failed.'));
  if (group === 'finalize' && action === undefined) return finalizeRun(cwd, run, requirePassing(await finalVerify(cwd, run), 'FINAL_GATE_FAILED', 'Final verification gate failed.'));
  throw new KernelError(`Unknown command: ${[group, action].filter(Boolean).join(' ')}.`, 'USAGE');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then((value) => { print(value); if (value?.ok === false) process.exitCode = 1; }).catch((error) => {
    const output = { ok: false, code: error.code || 'UNEXPECTED_ERROR', error: error.message, details: error.details || [] };
    process.stderr.write(`${JSON.stringify(output)}\n`); process.exitCode = 1;
  });
}
