import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  admitParallelism,
  loadCanonicalParallelAdmission,
  validateParallelAdmissionCorpus,
} from '../scripts/validate-parallel-admission.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('parallel-admission v0 accepts 12 synthetic contrasts and matches admit()', async () => {
  const corpus = await loadCanonicalParallelAdmission(root);
  const result = validateParallelAdmissionCorpus(corpus);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    schemaVersion: 1,
    policyVersion: 'parallel-admission-v0',
    cases: 12,
    pairs: 6,
    decisions: {
      'single-agent': 5,
      'sequential-units': 1,
      'read-only-fanout': 2,
      'isolated-write-fanout': 4,
    },
  });
});

test('large coupled work and review fan-out never admit spawn', async () => {
  const coupled = {
    kind: 'write',
    decomposition: 'coupled',
    zonesOverlap: false,
    worktreeIsolation: true,
    specifiedWithoutPeerOutput: true,
    setupCheaperThanWork: true,
    parentCanIntegrateFaster: true,
    hostSubagents: true,
    frozenContract: true,
    independentIntegrationOracle: true,
    sizeIsLarge: true,
    reviewFanout: false,
  };
  assert.equal(admitParallelism(coupled).decision, 'sequential-units');
  assert.equal(admitParallelism({ ...coupled, sizeIsLarge: false }).decision, 'single-agent');

  const review = {
    ...coupled,
    decomposition: 'independent',
    sizeIsLarge: true,
    reviewFanout: true,
  };
  assert.equal(admitParallelism(review).decision, 'single-agent');
  assert.equal(admitParallelism(review).maxConcurrency, 1);
});

test('parallel-admission validator rejects schema drift and expected/policy mismatch', async () => {
  const corpus = await loadCanonicalParallelAdmission(root);

  const duplicate = structuredClone(corpus);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.match(validateParallelAdmissionCorpus(duplicate).errors.join('\n'), /duplicate case id/i);

  const short = structuredClone(corpus);
  short.cases.pop();
  assert.match(validateParallelAdmissionCorpus(short).errors.join('\n'), /exactly 12 cases/i);

  const mismatch = structuredClone(corpus);
  mismatch.cases[0].expected.decision = 'read-only-fanout';
  assert.match(validateParallelAdmissionCorpus(mismatch).errors.join('\n'), /does not match admitParallelism/i);

  const payload = structuredClone(corpus);
  payload.cases[0].prompt = 'synthetic raw payload';
  assert.match(validateParallelAdmissionCorpus(payload).errors.join('\n'), /is not allowed|prohibited/i);
});

test('parallel-admission validator is read-only and does not launch agents', async () => {
  const script = path.join(root, 'scripts/validate-parallel-admission.mjs');
  const fixture = path.join(root, 'evals/fixtures/parallel-admission-v0.json');
  const before = await readFile(fixture, 'utf8');
  const result = validateParallelAdmissionCorpus(await loadCanonicalParallelAdmission(root));
  const after = await readFile(fixture, 'utf8');

  assert.equal(result.ok, true);
  assert.equal(after, before);

  const source = await readFile(script, 'utf8');
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|mkdir|rename|unlink|spawnSync|child_process|fetch)\b/);
  assert.doesNotMatch(source, /langgraph|temporal/i);
});

test('execution admission text forbids large-equals-seven and keeps host launch out of Pinmind', async () => {
  const execution = await readFile(path.join(root, 'skills/pinmind/references/execution.md'), 'utf8');
  const skill = await readFile(path.join(root, 'skills/pinmind/SKILL.md'), 'utf8');
  const aep = await readFile(path.join(root, 'ADAPTIVE_EXECUTION_POLICY.md'), 'utf8');

  assert.match(execution, /five-yes|Five-yes/i);
  assert.match(execution, /task is large|large coupled/i);
  assert.match(execution, /read-only/i);
  assert.match(execution, /worktree/i);
  assert.match(execution, /sequential units/i);
  assert.doesNotMatch(execution, /spawn 7 because|because the task is large/i);
  assert.match(skill, /five-yes|execution\.md/i);
  assert.match(aep, /do(?:es)? not change Pinmind runtime behavior/i);
  assert.doesNotMatch(aep, /exactly 17 cases|exactly 24 cases/i);
});
