import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FORMAT, KernelError, currentContract, executeTransition, exists, ids, jsonText, readJson, redact, redactValue, requireCanonicalActiveRun,
  safeRelativePath, safeRunId, setStateHash, sha256, validId, verifiedLayout, verifiedStateRoot, verifyRun,
  withWorkspaceLock, writeJsonAtomic, reconcileActiveRuns,
} from './persist.mjs';
import {
  allTargetIds, assessWorkspaceFingerprint, evidenceStoreHash, loadBaseline, loadEvidence, nonEmptyText,
  resolveContainedExisting, validateEvidence,
} from './evidence.mjs';

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
