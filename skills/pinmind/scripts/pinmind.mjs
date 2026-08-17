#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KernelError, amendContract, captureEvidence, finalVerify, finalizeRun, freezeContract, generateRunId, initRun, readBrief, readInputJson, reconcileActiveRuns,
  recordEvidence, recordUsage, reportRun, routeTask, stateResume, stateShow, validateAndSaveExecution, validateContract, validateEvidence,
} from './lib/core.mjs';

function parse(argv) {
  const positionals = []; const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) flags[value.slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    else positionals.push(value);
  }
  return { positionals, flags };
}
function requireFlag(flags, name) { if (typeof flags[name] !== 'string') throw new KernelError(`--${name} is required.`, 'MISSING_ARGUMENT'); return flags[name]; }
function print(value) { process.stdout.write(typeof value === 'string' ? `${value.replace(/\n?$/, '\n')}` : `${JSON.stringify(value, null, 2)}\n`); }
const usage = 'Usage: pinmind.mjs init|route|contract validate|contract freeze|contract amend|execution validate|evidence record|evidence capture --run RUN --file TEMPLATE [--cwd RELATIVE] [--timeout-ms 50..300000] -- COMMAND [ARGS...]|evidence validate|usage record|report|state show|state resume|state reconcile --dry-run|final verify';
function requirePassing(result, code, message) { if (!result.ok) throw new KernelError(message, code, result.errors); return result; }

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const divider = argv.indexOf('--'); const commandArgv = divider === -1 ? [] : argv.slice(divider + 1); const { positionals, flags } = parse(divider === -1 ? argv : argv.slice(0, divider)); const [group, action] = positionals;
  if (group === '--help' || group === '-h' || !group) return { ok: true, usage };
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
  const run = requireFlag(flags, 'run');
  if (group === 'report') return reportRun(cwd, run, typeof flags.format === 'string' ? flags.format : 'json');
  if (group === 'contract' && action === 'validate') { const candidate = await readInputJson(requireFlag(flags, 'file')); const result = validateContract(candidate); if (!result.ok) throw new KernelError('Contract validation failed.', 'INVALID_CONTRACT', result.errors); return result; }
  if (group === 'contract' && action === 'freeze') return freezeContract(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'contract' && action === 'amend') return amendContract(cwd, run, await readInputJson(requireFlag(flags, 'file')), requireFlag(flags, 'reason'), requireFlag(flags, 'affects').split(',').map((item) => item.trim()).filter(Boolean), requireFlag(flags, 'authority'));
  if (group === 'execution' && action === 'validate') return validateAndSaveExecution(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'evidence' && action === 'record') return recordEvidence(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'evidence' && action === 'capture') return captureEvidence(cwd, run, await readInputJson(requireFlag(flags, 'file')), commandArgv, typeof flags.cwd === 'string' ? flags.cwd : '.', { timeoutMs: flags['timeout-ms'] === undefined ? undefined : Number(flags['timeout-ms']) });
  if (group === 'evidence' && action === 'validate') return requirePassing(await validateEvidence(cwd, run), 'EVIDENCE_GATE_FAILED', 'Evidence validation gate failed.');
  if (group === 'usage' && action === 'record') return recordUsage(cwd, run, await readInputJson(requireFlag(flags, 'file')));
  if (group === 'final' && action === 'verify') return finalizeRun(cwd, run, requirePassing(await finalVerify(cwd, run), 'FINAL_GATE_FAILED', 'Final verification gate failed.'));
  throw new KernelError(`Unknown command: ${[group, action].filter(Boolean).join(' ')}.`, 'USAGE');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then((value) => { print(value); if (value?.ok === false) process.exitCode = 1; }).catch((error) => {
    const output = { ok: false, code: error.code || 'UNEXPECTED_ERROR', error: error.message, details: error.details || [] };
    process.stderr.write(`${JSON.stringify(output)}\n`); process.exitCode = 1;
  });
}
