#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const POLICY_VERSION = 'parallel-admission-v0';
const FIXTURE_PATH = 'evals/fixtures/parallel-admission-v0.json';
const CASE_COUNT = 12;
const PAIR_COUNT = 6;
const CORPUS_KEYS = Object.freeze(['schemaVersion', 'policyVersion', 'description', 'cases']);
const CASE_KEYS = Object.freeze(['id', 'pairId', 'variant', 'inputs', 'expected', 'provenance']);
const INPUT_KEYS = Object.freeze([
  'kind',
  'decomposition',
  'zonesOverlap',
  'worktreeIsolation',
  'specifiedWithoutPeerOutput',
  'setupCheaperThanWork',
  'parentCanIntegrateFaster',
  'hostSubagents',
  'frozenContract',
  'independentIntegrationOracle',
  'sizeIsLarge',
  'reviewFanout',
]);
const EXPECTED_KEYS = Object.freeze(['decision', 'maxConcurrency']);
const PROVENANCE_KEYS = Object.freeze(['kind', 'original', 'privateInput']);
const KINDS = new Set(['read', 'write']);
const DECOMPOSITIONS = new Set(['coupled', 'independent']);
const DECISIONS = new Set(['single-agent', 'sequential-units', 'read-only-fanout', 'isolated-write-fanout']);
const BOOLEANS = new Set(['zonesOverlap', 'worktreeIsolation', 'specifiedWithoutPeerOutput', 'setupCheaperThanWork', 'parentCanIntegrateFaster', 'hostSubagents', 'frozenContract', 'independentIntegrationOracle', 'sizeIsLarge', 'reviewFanout']);
const CONCURRENCY = Object.freeze({
  'single-agent': 1,
  'sequential-units': 1,
  'read-only-fanout': 7,
  'isolated-write-fanout': 4,
});
const FORBIDDEN_FIELDS = new Set(['prompt', 'text', 'trace', 'actualProfile', 'outcome', 'model', 'path']);
const CANONICAL_DESCRIPTION = 'Original reviewed-synthetic spawn admission contrasts. Size never admits fan-out.';

function addError(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function expectObject(value, location, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    addError(errors, location, 'must be an object');
    return false;
  }
  return true;
}

function expectExactKeys(value, keys, location, errors) {
  if (!expectObject(value, location, errors)) return false;
  const actual = Object.keys(value);
  const extra = actual.filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !actual.includes(key));
  if (extra.length) addError(errors, location, `${extra[0]} is not allowed`);
  if (missing.length) addError(errors, location, `${missing[0]} is required`);
  return extra.length === 0 && missing.length === 0;
}

function expectEnum(value, allowed, location, errors) {
  if (!allowed.has(value)) addError(errors, location, `must be one of: ${[...allowed].join(', ')}`);
}

function expectBoolean(value, location, errors) {
  if (typeof value !== 'boolean') addError(errors, location, 'must be a boolean');
}

function scanForbidden(value, location, errors, depth = 0) {
  if (depth > 8) {
    addError(errors, location, 'exceeds maximum payload depth');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) addError(errors, location, 'exceeds maximum collection size');
    value.forEach((item, index) => scanForbidden(item, `${location}[${index}]`, errors, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_FIELDS.has(key)) addError(errors, `${location}.${key}`, 'raw or observational payload fields are prohibited');
      scanForbidden(child, `${location}.${key}`, errors, depth + 1);
    }
  }
}

export function fiveYes(inputs) {
  const independent = inputs.decomposition === 'independent';
  const zoneOk = inputs.kind === 'read' || inputs.zonesOverlap !== true || inputs.worktreeIsolation === true;
  return independent
    && zoneOk
    && inputs.specifiedWithoutPeerOutput === true
    && inputs.setupCheaperThanWork === true
    && inputs.parentCanIntegrateFaster === true;
}

export function admitParallelism(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    return { decision: 'single-agent', maxConcurrency: 1 };
  }
  if (inputs.reviewFanout === true || inputs.hostSubagents !== true || fiveYes(inputs) !== true) {
    const sequential = inputs.sizeIsLarge === true && inputs.decomposition === 'coupled' && inputs.reviewFanout !== true;
    const decision = sequential ? 'sequential-units' : 'single-agent';
    return { decision, maxConcurrency: CONCURRENCY[decision] };
  }
  if (inputs.kind === 'read') {
    return { decision: 'read-only-fanout', maxConcurrency: CONCURRENCY['read-only-fanout'] };
  }
  if (inputs.kind === 'write' && inputs.frozenContract === true && inputs.independentIntegrationOracle === true) {
    return { decision: 'isolated-write-fanout', maxConcurrency: CONCURRENCY['isolated-write-fanout'] };
  }
  return { decision: 'single-agent', maxConcurrency: 1 };
}

function validateInputs(value, location, errors) {
  if (!expectExactKeys(value, INPUT_KEYS, location, errors)) return;
  expectEnum(value.kind, KINDS, `${location}.kind`, errors);
  expectEnum(value.decomposition, DECOMPOSITIONS, `${location}.decomposition`, errors);
  for (const key of BOOLEANS) expectBoolean(value[key], `${location}.${key}`, errors);
}

function validateExpected(value, inputs, location, errors) {
  if (!expectExactKeys(value, EXPECTED_KEYS, location, errors)) return;
  expectEnum(value.decision, DECISIONS, `${location}.decision`, errors);
  const admitted = admitParallelism(inputs);
  if (value.decision !== admitted.decision || value.maxConcurrency !== admitted.maxConcurrency) {
    addError(errors, location, `does not match admitParallelism (${admitted.decision}/${admitted.maxConcurrency})`);
  }
  if (value.maxConcurrency !== CONCURRENCY[value.decision]) {
    addError(errors, `${location}.maxConcurrency`, `must be ${CONCURRENCY[value.decision]} for ${value.decision}`);
  }
}

function validateCase(item, location, errors, seenIds, seenPairs) {
  if (!expectExactKeys(item, CASE_KEYS, location, errors)) return;
  if (typeof item.id !== 'string' || !/^adm-\d{3}[ab]$/.test(item.id)) addError(errors, `${location}.id`, 'must use adm-NNN plus variant a or b');
  if (typeof item.pairId !== 'string' || !/^adm-\d{3}$/.test(item.pairId)) addError(errors, `${location}.pairId`, 'must use adm-NNN');
  expectEnum(item.variant, new Set(['a', 'b']), `${location}.variant`, errors);
  if (item.id !== `${item.pairId}${item.variant}`) addError(errors, `${location}.id`, 'must equal pairId plus variant');
  if (seenIds.has(item.id)) addError(errors, `${location}.id`, 'duplicate case id');
  seenIds.add(item.id);
  seenPairs.add(item.pairId);
  if (!expectExactKeys(item.provenance, PROVENANCE_KEYS, `${location}.provenance`, errors)) return;
  if (item.provenance.kind !== 'reviewed-synthetic') addError(errors, `${location}.provenance.kind`, 'must be reviewed-synthetic');
  if (item.provenance.original !== true) addError(errors, `${location}.provenance.original`, 'must explicitly confirm an original example');
  if (item.provenance.privateInput !== false) addError(errors, `${location}.provenance.privateInput`, 'must be false');
  validateInputs(item.inputs, `${location}.inputs`, errors);
  validateExpected(item.expected, item.inputs, `${location}.expected`, errors);
}

export function validateParallelAdmissionCorpus(corpus) {
  const errors = [];
  scanForbidden(corpus, 'corpus', errors);
  if (!expectExactKeys(corpus, CORPUS_KEYS, 'corpus', errors)) return { ok: false, errors, summary: null };
  if (corpus.schemaVersion !== 1) addError(errors, 'corpus.schemaVersion', 'must be 1');
  if (corpus.policyVersion !== POLICY_VERSION) addError(errors, 'corpus.policyVersion', `must be ${POLICY_VERSION}`);
  if (corpus.description !== CANONICAL_DESCRIPTION) addError(errors, 'corpus.description', 'must equal the canonical description');
  if (!Array.isArray(corpus.cases)) {
    addError(errors, 'corpus.cases', 'must be an array');
    return { ok: false, errors, summary: null };
  }
  if (corpus.cases.length !== CASE_COUNT) addError(errors, 'cases', `must contain exactly ${CASE_COUNT} cases`);
  const seenIds = new Set();
  const seenPairs = new Set();
  const decisions = {
    'single-agent': 0,
    'sequential-units': 0,
    'read-only-fanout': 0,
    'isolated-write-fanout': 0,
  };
  corpus.cases.forEach((item, index) => {
    validateCase(item, `cases[${index}]`, errors, seenIds, seenPairs);
    if (item?.expected?.decision && Object.hasOwn(decisions, item.expected.decision)) decisions[item.expected.decision] += 1;
  });
  if (seenPairs.size !== PAIR_COUNT) addError(errors, 'cases', `must contain exactly ${PAIR_COUNT} pairs`);
  if (!decisions['read-only-fanout'] || !decisions['isolated-write-fanout'] || !decisions['single-agent']) {
    addError(errors, 'cases', 'must include forbidden, read-only, and worktree-write outcomes');
  }
  const largeCoupledFanout = (corpus.cases || []).some((item) => (
    item?.inputs?.sizeIsLarge === true
    && item?.inputs?.decomposition === 'coupled'
    && (item?.expected?.decision === 'read-only-fanout' || item?.expected?.decision === 'isolated-write-fanout')
  ));
  if (largeCoupledFanout) addError(errors, 'cases', 'sizeIsLarge coupled work must not admit fan-out');

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      schemaVersion: 1,
      policyVersion: POLICY_VERSION,
      cases: corpus.cases.length,
      pairs: seenPairs.size,
      decisions,
    },
  };
}

export async function loadCanonicalParallelAdmission(root) {
  const file = path.join(root, FIXTURE_PATH);
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = validateParallelAdmissionCorpus(await loadCanonicalParallelAdmission(root));
  process.stdout.write(`${JSON.stringify({ ok: result.ok, errors: result.errors, summary: result.summary }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
