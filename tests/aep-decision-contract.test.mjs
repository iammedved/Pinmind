import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadCanonicalAepCorpora,
  validateAepCorpora,
} from '../scripts/validate-aep-decision-contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function mutated(corpora, change) {
  const copy = structuredClone(corpora);
  change(copy);
  return validateAepCorpora(copy);
}

function rejectsMutation(corpora, change, pattern) {
  const result = mutated(corpora, change);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), pattern);
}

test('AEP Decision Contract v0 accepts the canonical 16-case contrast corpus', async () => {
  const corpora = await loadCanonicalAepCorpora(root);
  const result = validateAepCorpora(corpora);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    schemaVersion: 1,
    policyVersion: 'aep-decision-contract-v0',
    files: 2,
    cases: 16,
    pairs: 8,
    splits: { dev: 8, release: 8 },
  });
});

test('AEP validator rejects schema, pair, privacy, capability, and oracle mutations', async () => {
  const corpora = await loadCanonicalAepCorpora(root);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[1].id = copy[0].cases[0].id;
  }, /duplicate case id|must equal pairId plus variant/i);

  rejectsMutation(corpora, (copy) => {
    for (const item of copy[0].cases.slice(0, 2)) {
      item.pairId = 'aep-unapproved-identifier-001';
      item.id = `${item.pairId}${item.variant}`;
    }
  }, /must be a canonical dev pair id/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases.pop();
  }, /exactly two cases|exactly 16 cases/i);

  rejectsMutation(corpora, (copy) => {
    copy[1].cases[0].split = 'dev';
  }, /must match file split release|must not cross dev and release/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[1].inputs.routeSnapshot.risk = 'medium';
  }, /declared contrast paths do not match observed input differences/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[0].expectedRecommendation.workShape = 'automatic-team';
  }, /must be one of: direct, programmatic, single-agent, multi-agent/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[0].prompt = 'synthetic raw payload';
  }, /raw or observational payload fields are prohibited|is not allowed/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[0].expectedRecommendation.actualProfile = 'bounded-fast';
  }, /raw or observational payload fields are prohibited|is not allowed/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].description += ` ${['', 'home', 'example-user', 'project'].join('/')}`;
  }, /private-path, identity, key, or credential pattern/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].description = 'arbitrary free-form fixture description';
  }, /must equal the canonical dev description/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].description += ` ${['C:', 'Users', 'example-user'].join('/')}`;
  }, /private-path, identity, key, or credential pattern/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].description += ` ${['Lu', 'na'].join('')}`;
  }, /concrete model brand/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[0].provenance.original = false;
  }, /must explicitly confirm an original example/i);

  rejectsMutation(corpora, (copy) => {
    copy[0].cases[4].expectedRecommendation.workShape = 'multi-agent';
  }, /multi-agent requires host subagents and independent decomposition|multi-agent cannot be the default/i);

  rejectsMutation(corpora, (copy) => {
    for (const item of copy[0].cases.slice(4, 6)) {
      item.inputs.probeSignals.oracleAvailability = 'missing';
      item.expectedRecommendation.escalationReason = 'oracle-missing';
      item.expectedRecommendation.verificationOracle = { type: 'none', availability: 'missing', independent: false };
      item.expectedRecommendation.decisionConfidence = 'low';
      item.expectedRecommendation.needsHumanConfirmation = true;
    }
  }, /multi-agent requires an available independent oracle/i);

  rejectsMutation(corpora, (copy) => {
    copy[1].cases[5].expectedRecommendation.allowedFallbacks = ['programmatic'];
  }, /programmatic fallback requires host programmaticCalls/i);

  rejectsMutation(corpora, (copy) => {
    const missingOracle = copy[1].cases[7].expectedRecommendation;
    missingOracle.decisionConfidence = 'high';
    missingOracle.needsHumanConfirmation = false;
  }, /missing oracle requires low confidence|missing oracle requires human confirmation/i);
});

test('AEP validator rejects structurally abusive input without recursive stack failure', async () => {
  const corpora = await loadCanonicalAepCorpora(root);
  let nested = {};
  let cursor = nested;
  for (let index = 0; index < 20_000; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  corpora[0].description = nested;

  let result;
  assert.doesNotThrow(() => {
    result = validateAepCorpora(corpora);
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /maximum payload depth/i);

  const wideCorpora = await loadCanonicalAepCorpora(root);
  const wide = {};
  for (let index = 0; index < 64; index += 1) wide[`field${index}`] = index;
  Object.defineProperty(wide, 'overflow', {
    enumerable: true,
    get() {
      throw new Error('collection limit read past its boundary');
    },
  });
  wideCorpora[0].description = wide;

  let wideResult;
  assert.doesNotThrow(() => {
    wideResult = validateAepCorpora(wideCorpora);
  });
  assert.equal(wideResult.ok, false);
  assert.match(wideResult.errors.join('\n'), /maximum collection size/i);
});

test('AEP validator module is read-only and returns the bounded canonical summary', async () => {
  const script = path.join(root, 'scripts/validate-aep-decision-contract.mjs');
  const fixtures = [
    path.join(root, 'evals/fixtures/aep-decision-contract-v0.dev.json'),
    path.join(root, 'evals/fixtures/aep-decision-contract-v0.release.json'),
  ];
  const before = await Promise.all(fixtures.map((file) => readFile(file, 'utf8')));
  const output = validateAepCorpora(await loadCanonicalAepCorpora(root));
  const after = await Promise.all(fixtures.map((file) => readFile(file, 'utf8')));

  assert.equal(output.ok, true);
  assert.equal(output.summary.cases, 16);
  assert.equal(output.summary.pairs, 8);
  assert.deepEqual(after, before);

  const source = await readFile(script, 'utf8');
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|mkdir|rename|unlink|spawn|fetch)\b/);
});

test('AEP specification preserves route ownership and observation boundaries', async () => {
  const specification = await readFile(path.join(root, 'ADAPTIVE_EXECUTION_POLICY.md'), 'utf8');

  for (const field of ['routeSnapshot', 'probeSignals', 'hostCapabilities', 'workShape', 'desiredProfile', 'escalationReason', 'verificationOracle', 'decisionConfidence', 'needsHumanConfirmation', 'actualProfile', 'outcome']) {
    assert.match(specification, new RegExp(`\\b${field}\\b`), field);
  }
  for (const workShape of ['direct', 'programmatic', 'single-agent', 'multi-agent']) assert.ok(specification.includes(`\`${workShape}\``), workShape);
  for (const profile of ['bounded-fast', 'balanced-execution', 'deep-decision', 'exceptional-decision']) assert.ok(specification.includes(`\`${profile}\``), profile);
  assert.match(specification, /actualProfile.*outcome.*observations/is);
  assert.match(specification, /do(?:es)? not change Pinmind runtime behavior/i);
  assert.match(specification, /separate future contract and authorization/i);
  assert.doesNotMatch(specification, /\b(?:luna|terra|sol|gpt[-\s]?\d(?:\.\d+)?)\b/i);
});
