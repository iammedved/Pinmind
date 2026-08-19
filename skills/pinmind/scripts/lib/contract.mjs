import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FORMAT, KernelError, canonicalJson, currentContract, executeTransition, exists, hashWithout, ids, jsonText,
  redact, redactValue, requireArray, requireCanonicalActiveRun, safeRunId, setStateHash, validId, validEvidenceId,
  verifyRun, withWorkspaceLock,
} from './persist.mjs';
import { evidenceStoreHash, loadBaseline, loadEvidence } from './evidence.mjs';

const PRIORITIES = new Set(['must', 'should', 'could']);
const PREFIXES = { obligations: 'REQ', acceptanceCriteria: 'AC', invariants: 'INV', preservation: 'PRES', publicSeams: 'SEAM', nonFunctional: 'NFR' };
const TOP_LEVEL_TOKENS = ['INTENT', 'ACTORS', 'BOUNDARIES', 'ASSUMPTIONS', 'OUT-OF-SCOPE'];
const CONTRACT_FIELDS = new Set(['contractId', 'version', 'status', 'source', 'intent', 'actors', 'obligations', 'acceptanceCriteria', 'invariants', 'preservation', 'boundaries', 'publicSeams', 'nonFunctional', 'assumptions', 'outOfScope', 'contractSha256', 'amends']);
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
