#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const POLICY_VERSION = 'aep-decision-contract-v0';
const WORK_SHAPES = new Set(['direct', 'programmatic', 'single-agent', 'multi-agent']);
const PROFILES = new Set(['bounded-fast', 'balanced-execution', 'deep-decision', 'exceptional-decision']);
const ESCALATION_REASONS = new Set([
  'none',
  'scope-expanded',
  'oracle-missing',
  'evidence-conflict',
  'repeated-failure',
  'high-impact-boundary',
  'capability-unavailable',
]);
const ORACLE_TYPES = new Set([
  'unit-test',
  'integration-test',
  'lint-static-analysis',
  'browser-journey',
  'diff-invariant',
  'manual-pending-review',
  'none',
]);
const ORACLE_AVAILABILITY = new Set(['available', 'manual', 'missing']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const SPLITS = new Set(['dev', 'release']);
const DESCRIPTIONS = Object.freeze({
  dev: 'Original reviewed-synthetic development contrasts for provider-neutral execution recommendations.',
  release: 'Original reviewed-synthetic held-out contrasts for provider-neutral execution recommendations.',
});
const PAIR_IDS_BY_SPLIT = Object.freeze({
  dev: new Set([
    'aep-workshape-direct-programmatic-001',
    'aep-workshape-direct-single-002',
    'aep-workshape-single-multi-003',
    'aep-profile-bounded-balanced-004',
  ]),
  release: new Set([
    'aep-profile-balanced-deep-005',
    'aep-profile-deep-exceptional-006',
    'aep-capability-programmatic-007',
    'aep-oracle-present-missing-008',
  ]),
});
const ROUTES = new Set(['simple', 'operational', 'spike', 'audit', 'investigation', 'software-change']);
const CLARITY = new Set(['clear', 'uncertain', 'architectural']);
const SPANS = new Set(['local', 'cross-cutting', 'multi-system']);
const RISKS = new Set(['low', 'medium', 'high']);
const PROBE_ENUMS = Object.freeze({
  coordinationPattern: new Set(['semantic-single-step', 'bounded-parallel-batch', 'exploratory']),
  scopeState: new Set(['bounded', 'expanded']),
  decomposition: new Set(['none', 'coupled', 'independent']),
  failureState: new Set(['none', 'repeated']),
  evidenceState: new Set(['consistent', 'conflicting']),
  decisionImpact: new Set(['reversible', 'hard-to-reverse']),
  oracleAvailability: new Set(['deterministic', 'manual', 'missing']),
});

const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'policyVersion', 'split', 'description', 'cases']);
const CASE_KEYS = new Set(['id', 'pairId', 'variant', 'split', 'contrastInputPaths', 'inputs', 'expectedRecommendation', 'provenance']);
const INPUT_KEYS = new Set(['routeSnapshot', 'probeSignals', 'hostCapabilities']);
const ROUTE_KEYS = new Set(['route', 'clarity', 'executionSpan', 'risk', 'needsHumanConfirmation']);
const HOST_KEYS = new Set(['programmaticCalls', 'subagents', 'availableProfiles']);
const RECOMMENDATION_KEYS = new Set([
  'workShape',
  'desiredProfile',
  'escalationReason',
  'verificationOracle',
  'decisionConfidence',
  'needsHumanConfirmation',
  'allowedFallbacks',
]);
const ORACLE_KEYS = new Set(['type', 'availability', 'independent']);
const PROVENANCE_KEYS = new Set(['kind', 'original', 'privateInput']);
const PROHIBITED_PAYLOAD_KEYS = new Set([
  'actualprofile',
  'actualworkshape',
  'authorization',
  'argv',
  'body',
  'chat',
  'command',
  'content',
  'cookie',
  'credential',
  'email',
  'outcome',
  'path',
  'privatepath',
  'prompt',
  'rawprompt',
  'rawtrace',
  'response',
  'secret',
  'text',
  'token',
  'trace',
  'username',
]);
const PRIVATE_VALUE_PATTERNS = [
  /(?:^|\s)\/home\/[A-Za-z0-9._-]+/i,
  /[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9._-]+/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /Bearer\s+[A-Za-z0-9._~-]{16,}/i,
];
const MODEL_BRAND_PATTERN = /\b(?:luna|terra|sol|gpt[-\s]?\d(?:\.\d+)?)\b/i;
const MAX_PAYLOAD_DEPTH = 12;
const MAX_PAYLOAD_NODES = 10_000;
const MAX_COLLECTION_ITEMS = 64;
const MAX_STRING_LENGTH = 512;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function addError(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function expectObject(value, location, errors) {
  if (!isObject(value)) {
    addError(errors, location, 'must be an object');
    return false;
  }
  return true;
}

function expectExactKeys(value, allowed, location, errors) {
  if (!expectObject(value, location, errors)) return false;
  for (const key of Object.keys(value)) if (!allowed.has(key)) addError(errors, `${location}.${key}`, 'is not allowed');
  for (const key of allowed) if (!(key in value)) addError(errors, `${location}.${key}`, 'is required');
  return true;
}

function expectEnum(value, allowed, location, errors) {
  if (typeof value !== 'string' || !allowed.has(value)) addError(errors, location, `must be one of: ${[...allowed].join(', ')}`);
}

function expectBoolean(value, location, errors) {
  if (typeof value !== 'boolean') addError(errors, location, 'must be a boolean');
}

function expectUniqueEnumArray(value, allowed, location, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    addError(errors, location, allowEmpty ? 'must be an array' : 'must be a non-empty array');
    return;
  }
  const seen = new Set();
  for (const item of value) {
    expectEnum(item, allowed, `${location}[]`, errors);
    if (seen.has(item)) addError(errors, location, `contains duplicate value ${JSON.stringify(item)}`);
    seen.add(item);
  }
}

function inspectPayload(rootValue, rootLocation, errors) {
  const stack = [{ value: rootValue, location: rootLocation, depth: 0 }];
  const seen = new WeakSet();
  let nodes = 0;

  while (stack.length > 0) {
    const { value, location, depth } = stack.pop();
    nodes += 1;
    if (nodes > MAX_PAYLOAD_NODES) {
      addError(errors, rootLocation, `exceeds maximum payload node count ${MAX_PAYLOAD_NODES}`);
      return false;
    }
    if (depth > MAX_PAYLOAD_DEPTH) {
      addError(errors, location, `exceeds maximum payload depth ${MAX_PAYLOAD_DEPTH}`);
      return false;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        addError(errors, location, 'must not contain cyclic or aliased structures');
        return false;
      }
      seen.add(value);
      if (value.length > MAX_COLLECTION_ITEMS) {
        addError(errors, location, `exceeds maximum collection size ${MAX_COLLECTION_ITEMS}`);
        return false;
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], location: `${location}[${index}]`, depth: depth + 1 });
      }
      continue;
    }
    if (isObject(value)) {
      if (seen.has(value)) {
        addError(errors, location, 'must not contain cyclic or aliased structures');
        return false;
      }
      seen.add(value);
      const entries = [];
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (entries.length === MAX_COLLECTION_ITEMS) {
          addError(errors, location, `exceeds maximum collection size ${MAX_COLLECTION_ITEMS}`);
          return false;
        }
        let item;
        try {
          item = value[key];
        } catch {
          addError(errors, `${location}.${key}`, 'could not be read safely');
          return false;
        }
        entries.push([key, item]);
      }
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, item] = entries[index];
        if (PROHIBITED_PAYLOAD_KEYS.has(key.toLowerCase())) addError(errors, `${location}.${key}`, 'raw or observational payload fields are prohibited in Phase 0 fixtures');
        stack.push({ value: item, location: `${location}.${key}`, depth: depth + 1 });
      }
      continue;
    }
    if (typeof value !== 'string') continue;
    if (value.length > MAX_STRING_LENGTH) addError(errors, location, `exceeds maximum string length ${MAX_STRING_LENGTH}`);
    for (const pattern of PRIVATE_VALUE_PATTERNS) if (pattern.test(value)) addError(errors, location, 'contains a private-path, identity, key, or credential pattern');
    if (MODEL_BRAND_PATTERN.test(value)) addError(errors, location, 'contains a concrete model brand; fixtures must stay provider-neutral');
  }
  return true;
}

function diffPaths(left, right, prefix = '') {
  if (canonical(left) === canonical(right)) return [];
  if (isObject(left) && isObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.flatMap((key) => diffPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function validateRouteSnapshot(value, location, errors) {
  if (!expectExactKeys(value, ROUTE_KEYS, location, errors)) return;
  expectEnum(value.route, ROUTES, `${location}.route`, errors);
  expectEnum(value.clarity, CLARITY, `${location}.clarity`, errors);
  expectEnum(value.executionSpan, SPANS, `${location}.executionSpan`, errors);
  expectEnum(value.risk, RISKS, `${location}.risk`, errors);
  expectBoolean(value.needsHumanConfirmation, `${location}.needsHumanConfirmation`, errors);
}

function validateProbeSignals(value, location, errors) {
  if (!expectObject(value, location, errors)) return;
  const keys = Object.keys(value);
  if (keys.length === 0) addError(errors, location, 'must contain at least one normalized probe signal');
  for (const key of keys) {
    if (!(key in PROBE_ENUMS)) addError(errors, `${location}.${key}`, 'is not a recognized Phase 0 probe signal');
    else expectEnum(value[key], PROBE_ENUMS[key], `${location}.${key}`, errors);
  }
}

function validateHostCapabilities(value, location, errors) {
  if (!expectExactKeys(value, HOST_KEYS, location, errors)) return;
  expectBoolean(value.programmaticCalls, `${location}.programmaticCalls`, errors);
  expectBoolean(value.subagents, `${location}.subagents`, errors);
  expectUniqueEnumArray(value.availableProfiles, PROFILES, `${location}.availableProfiles`, errors);
}

function validateOracle(value, location, errors) {
  if (!expectExactKeys(value, ORACLE_KEYS, location, errors)) return;
  expectEnum(value.type, ORACLE_TYPES, `${location}.type`, errors);
  expectEnum(value.availability, ORACLE_AVAILABILITY, `${location}.availability`, errors);
  expectBoolean(value.independent, `${location}.independent`, errors);
  if (value.type === 'none' && value.availability !== 'missing') addError(errors, location, 'type none requires missing availability');
  if (value.type !== 'none' && value.availability === 'missing') addError(errors, location, 'missing availability requires oracle type none');
  if (value.type === 'manual-pending-review' && value.availability !== 'manual') addError(errors, location, 'manual-pending-review requires manual availability');
  if (value.availability === 'manual' && value.type !== 'manual-pending-review') addError(errors, location, 'manual availability requires manual-pending-review');
}

function validateRecommendation(value, inputs, location, errors) {
  if (!expectExactKeys(value, RECOMMENDATION_KEYS, location, errors)) return;
  expectEnum(value.workShape, WORK_SHAPES, `${location}.workShape`, errors);
  expectEnum(value.desiredProfile, PROFILES, `${location}.desiredProfile`, errors);
  expectEnum(value.escalationReason, ESCALATION_REASONS, `${location}.escalationReason`, errors);
  validateOracle(value.verificationOracle, `${location}.verificationOracle`, errors);
  expectEnum(value.decisionConfidence, CONFIDENCE, `${location}.decisionConfidence`, errors);
  expectBoolean(value.needsHumanConfirmation, `${location}.needsHumanConfirmation`, errors);
  expectUniqueEnumArray(value.allowedFallbacks, WORK_SHAPES, `${location}.allowedFallbacks`, errors, { allowEmpty: true });

  if (Array.isArray(value.allowedFallbacks) && value.allowedFallbacks.includes(value.workShape)) addError(errors, `${location}.allowedFallbacks`, 'must not repeat the selected workShape');
  if (Array.isArray(inputs?.hostCapabilities?.availableProfiles) && !inputs.hostCapabilities.availableProfiles.includes(value.desiredProfile)) addError(errors, `${location}.desiredProfile`, 'is unavailable on the declared host capabilities');
  if (value.workShape === 'programmatic' && inputs?.hostCapabilities?.programmaticCalls !== true) addError(errors, `${location}.workShape`, 'programmatic requires host programmaticCalls');
  if (value.workShape === 'multi-agent' && (inputs?.hostCapabilities?.subagents !== true || inputs?.probeSignals?.decomposition !== 'independent')) addError(errors, `${location}.workShape`, 'multi-agent requires host subagents and independent decomposition');
  if (inputs?.probeSignals?.decomposition !== 'independent' && value.workShape === 'multi-agent') addError(errors, `${location}.workShape`, 'multi-agent cannot be the default for coupled or unspecified work');
  if (value.workShape === 'multi-agent' && (value.verificationOracle?.type !== 'integration-test' || value.verificationOracle?.availability !== 'available' || value.verificationOracle?.independent !== true)) addError(errors, `${location}.workShape`, 'multi-agent requires an available independent oracle of type integration-test');
  if (Array.isArray(value.allowedFallbacks)) {
    if (value.allowedFallbacks.includes('programmatic') && inputs?.hostCapabilities?.programmaticCalls !== true) addError(errors, `${location}.allowedFallbacks`, 'programmatic fallback requires host programmaticCalls');
    if (value.allowedFallbacks.includes('multi-agent') && (inputs?.hostCapabilities?.subagents !== true || inputs?.probeSignals?.decomposition !== 'independent' || value.verificationOracle?.type !== 'integration-test' || value.verificationOracle?.availability !== 'available' || value.verificationOracle?.independent !== true)) addError(errors, `${location}.allowedFallbacks`, 'multi-agent fallback requires host subagents, independent decomposition, and an available independent integration-test oracle');
  }
  if (inputs?.routeSnapshot?.needsHumanConfirmation === true && value.needsHumanConfirmation !== true) addError(errors, `${location}.needsHumanConfirmation`, 'cannot downgrade an existing route confirmation gate');

  const oracleMissing = inputs?.probeSignals?.oracleAvailability === 'missing';
  if (oracleMissing) {
    if (value.escalationReason !== 'oracle-missing') addError(errors, `${location}.escalationReason`, 'missing oracle requires oracle-missing');
    if (value.decisionConfidence !== 'low') addError(errors, `${location}.decisionConfidence`, 'missing oracle requires low confidence');
    if (value.needsHumanConfirmation !== true) addError(errors, `${location}.needsHumanConfirmation`, 'missing oracle requires human confirmation');
    if (value.verificationOracle?.type !== 'none' || value.verificationOracle?.availability !== 'missing') addError(errors, `${location}.verificationOracle`, 'missing oracle must remain explicitly unavailable');
  }
  if (inputs?.probeSignals?.decisionImpact === 'hard-to-reverse') {
    if (value.escalationReason !== 'high-impact-boundary') addError(errors, `${location}.escalationReason`, 'hard-to-reverse decisions require high-impact-boundary');
    if (value.needsHumanConfirmation !== true) addError(errors, `${location}.needsHumanConfirmation`, 'hard-to-reverse decisions require human confirmation');
  }
}

function validateCase(item, fileSplit, location, errors) {
  if (!expectExactKeys(item, CASE_KEYS, location, errors)) return;
  if (typeof item.id !== 'string' || !/^aep-[a-z0-9-]+-\d{3}[ab]$/.test(item.id)) addError(errors, `${location}.id`, 'must use a stable aep-* case id ending in variant a or b');
  if (typeof item.pairId !== 'string' || !/^aep-[a-z0-9-]+-\d{3}$/.test(item.pairId)) addError(errors, `${location}.pairId`, 'must use a stable aep-* pair id');
  else if (PAIR_IDS_BY_SPLIT[fileSplit] && !PAIR_IDS_BY_SPLIT[fileSplit].has(item.pairId)) addError(errors, `${location}.pairId`, `must be a canonical ${fileSplit} pair id`);
  expectEnum(item.variant, new Set(['a', 'b']), `${location}.variant`, errors);
  expectEnum(item.split, SPLITS, `${location}.split`, errors);
  if (item.split !== fileSplit) addError(errors, `${location}.split`, `must match file split ${fileSplit}`);
  if (typeof item.id === 'string' && typeof item.pairId === 'string' && typeof item.variant === 'string' && item.id !== `${item.pairId}${item.variant}`) addError(errors, `${location}.id`, 'must equal pairId plus variant');
  if (!Array.isArray(item.contrastInputPaths) || item.contrastInputPaths.length === 0 || !item.contrastInputPaths.every((entry) => typeof entry === 'string' && entry.startsWith('inputs.'))) addError(errors, `${location}.contrastInputPaths`, 'must be a non-empty array of inputs.* paths');
  else if (new Set(item.contrastInputPaths).size !== item.contrastInputPaths.length) addError(errors, `${location}.contrastInputPaths`, 'must not contain duplicates');

  if (expectExactKeys(item.inputs, INPUT_KEYS, `${location}.inputs`, errors)) {
    validateRouteSnapshot(item.inputs.routeSnapshot, `${location}.inputs.routeSnapshot`, errors);
    validateProbeSignals(item.inputs.probeSignals, `${location}.inputs.probeSignals`, errors);
    validateHostCapabilities(item.inputs.hostCapabilities, `${location}.inputs.hostCapabilities`, errors);
  }
  validateRecommendation(item.expectedRecommendation, item.inputs, `${location}.expectedRecommendation`, errors);
  if (expectExactKeys(item.provenance, PROVENANCE_KEYS, `${location}.provenance`, errors)) {
    if (item.provenance.kind !== 'reviewed-synthetic') addError(errors, `${location}.provenance.kind`, 'must be reviewed-synthetic in Phase 0');
    if (item.provenance.original !== true) addError(errors, `${location}.provenance.original`, 'must explicitly confirm an original example');
    if (item.provenance.privateInput !== false) addError(errors, `${location}.provenance.privateInput`, 'must explicitly confirm no private input');
  }
}

function validateCorpus(corpus, index, errors) {
  const location = `corpora[${index}]`;
  if (!expectExactKeys(corpus, TOP_LEVEL_KEYS, location, errors)) return [];
  if (corpus.schemaVersion !== 1) addError(errors, `${location}.schemaVersion`, 'must equal 1');
  if (corpus.policyVersion !== POLICY_VERSION) addError(errors, `${location}.policyVersion`, `must equal ${POLICY_VERSION}`);
  expectEnum(corpus.split, SPLITS, `${location}.split`, errors);
  if (typeof corpus.description !== 'string' || !corpus.description.trim() || corpus.description.length > 240) addError(errors, `${location}.description`, 'must be a non-empty bounded string');
  else if (DESCRIPTIONS[corpus.split] && corpus.description !== DESCRIPTIONS[corpus.split]) addError(errors, `${location}.description`, `must equal the canonical ${corpus.split} description`);
  if (!Array.isArray(corpus.cases)) {
    addError(errors, `${location}.cases`, 'must be an array');
    return [];
  }
  corpus.cases.forEach((item, caseIndex) => validateCase(item, corpus.split, `${location}.cases[${caseIndex}]`, errors));
  return corpus.cases;
}

function validateGlobal(corpora, cases, errors) {
  const splitCounts = { dev: 0, release: 0 };
  const fileSplits = corpora.map((corpus) => corpus?.split);
  if (corpora.length !== 2) addError(errors, 'corpora', 'must contain exactly two fixture files');
  if (fileSplits.filter((value) => value === 'dev').length !== 1 || fileSplits.filter((value) => value === 'release').length !== 1) addError(errors, 'corpora', 'must contain exactly one dev and one release file');

  const ids = new Set();
  const pairs = new Map();
  const signatures = { dev: new Set(), release: new Set() };
  for (const item of cases) {
    if (SPLITS.has(item?.split)) splitCounts[item.split] += 1;
    if (ids.has(item?.id)) addError(errors, item?.id || 'case', 'duplicate case id');
    ids.add(item?.id);
    if (!pairs.has(item?.pairId)) pairs.set(item?.pairId, []);
    pairs.get(item?.pairId).push(item);
    if (SPLITS.has(item?.split)) signatures[item.split].add(canonical(item.inputs));
  }
  if (cases.length !== 16) addError(errors, 'cases', `must contain exactly 16 cases; observed ${cases.length}`);
  if (pairs.size !== 8) addError(errors, 'pairs', `must contain exactly 8 pairs; observed ${pairs.size}`);
  if (splitCounts.dev !== 8 || splitCounts.release !== 8) addError(errors, 'splits', `must contain 8 dev and 8 release cases; observed ${splitCounts.dev}/${splitCounts.release}`);

  for (const [pairId, members] of pairs) {
    if (members.length !== 2) {
      addError(errors, pairId, `must contain exactly two cases; observed ${members.length}`);
      continue;
    }
    const variants = new Set(members.map((item) => item.variant));
    if (variants.size !== 2 || !variants.has('a') || !variants.has('b')) addError(errors, pairId, 'must contain variants a and b');
    if (members[0].split !== members[1].split) addError(errors, pairId, 'must not cross dev and release splits');
    if (canonical(members[0].contrastInputPaths) !== canonical(members[1].contrastInputPaths)) addError(errors, pairId, 'members must declare the same contrastInputPaths');
    const observedPaths = diffPaths(members[0].inputs, members[1].inputs, 'inputs').sort();
    const declaredPaths = [...(members[0].contrastInputPaths || [])].sort();
    if (canonical(observedPaths) !== canonical(declaredPaths)) addError(errors, pairId, `declared contrast paths do not match observed input differences: ${observedPaths.join(', ') || 'none'}`);
    if (canonical(members[0].expectedRecommendation) === canonical(members[1].expectedRecommendation)) addError(errors, pairId, 'contrast members must produce distinct recommendations');
  }

  for (const signature of signatures.release) if (signatures.dev.has(signature)) addError(errors, 'splits', 'release inputs must not duplicate development inputs');

  const observedWorkShapes = new Set(cases.map((item) => item?.expectedRecommendation?.workShape));
  const observedProfiles = new Set(cases.map((item) => item?.expectedRecommendation?.desiredProfile));
  for (const value of WORK_SHAPES) if (!observedWorkShapes.has(value)) addError(errors, 'coverage.workShape', `missing ${value}`);
  for (const value of PROFILES) if (!observedProfiles.has(value)) addError(errors, 'coverage.desiredProfile', `missing ${value}`);
  const multiAgentCases = cases.filter((item) => item?.expectedRecommendation?.workShape === 'multi-agent');
  if (multiAgentCases.length !== 1) addError(errors, 'coverage.multi-agent', `must be a single exceptional case; observed ${multiAgentCases.length}`);
}

export function validateAepCorpora(corpora) {
  const errors = [];
  if (!Array.isArray(corpora)) {
    return {
      ok: false,
      errors: ['corpora: must be an array'],
      summary: { schemaVersion: 1, policyVersion: POLICY_VERSION, files: 0, cases: 0, pairs: 0, splits: { dev: 0, release: 0 } },
    };
  }
  if (!inspectPayload(corpora, 'corpora', errors)) {
    return {
      ok: false,
      errors,
      summary: { schemaVersion: 1, policyVersion: POLICY_VERSION, files: corpora.length, cases: 0, pairs: 0, splits: { dev: 0, release: 0 } },
    };
  }
  const cases = corpora.flatMap((corpus, index) => validateCorpus(corpus, index, errors));
  validateGlobal(corpora, cases, errors);
  const pairCount = new Set(cases.map((item) => item?.pairId).filter(Boolean)).size;
  const splitCounts = {
    dev: cases.filter((item) => item?.split === 'dev').length,
    release: cases.filter((item) => item?.split === 'release').length,
  };
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      schemaVersion: 1,
      policyVersion: POLICY_VERSION,
      files: corpora.length,
      cases: cases.length,
      pairs: pairCount,
      splits: splitCounts,
    },
  };
}

export async function loadCanonicalAepCorpora(rootDirectory = fileURLToPath(new URL('..', import.meta.url))) {
  const files = [
    'evals/fixtures/aep-decision-contract-v0.dev.json',
    'evals/fixtures/aep-decision-contract-v0.release.json',
  ];
  return Promise.all(files.map(async (relative) => JSON.parse(await readFile(path.join(rootDirectory, relative), 'utf8'))));
}

async function runCli() {
  const corpora = await loadCanonicalAepCorpora();
  const result = validateAepCorpora(corpora);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  });
}
