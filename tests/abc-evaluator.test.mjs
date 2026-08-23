import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  AbcEvaluationError,
  evaluateAbc,
  main,
  validateAbcEvaluation,
} from '../scripts/evaluate-abc.mjs';

const fixturePath = fileURLToPath(new URL('../evals/fixtures/abc-sample.json', import.meta.url));
const profilePath = fileURLToPath(new URL('../evals/readability-profile.json', import.meta.url));
const load = async () => ({
  fixture: JSON.parse(await readFile(fixturePath, 'utf8')),
  profile: JSON.parse(await readFile(profilePath, 'utf8')),
});
const copy = (value) => structuredClone(value);
const rejectsCode = (action, code) => assert.throws(action, (error) => error instanceof AbcEvaluationError && error.code === code);
const verifySyntheticReceipt = ({ receiptId, value, taskId, arm }) => receiptId.startsWith('synthetic-') && value === 120 && taskId.startsWith('task-') && arm === 'B';
const syntheticCompletedFixture = (pendingFixture) => ({
  ...copy(pendingFixture),
  status: 'complete',
  observations: [
    { taskId: 'task-alpha', arm: 'A', order: 1, metrics: { errors: 1, userQuestions: 1, durationMs: 1200, evidenceQuality: 76, repeatedRepairs: 1, tokens: { status: 'unavailable' } }, review: 'synthetic-test-only' },
    { taskId: 'task-alpha', arm: 'B', order: 2, metrics: { errors: 1, userQuestions: 1, durationMs: 1320, evidenceQuality: 79, repeatedRepairs: 1, tokens: { status: 'authoritative-receipt', value: 120, receiptId: 'synthetic-alpha-b' } }, review: 'synthetic-test-only' },
    { taskId: 'task-alpha', arm: 'C', order: 3, metrics: { errors: 0, userQuestions: 1, durationMs: 1260, evidenceQuality: 84, repeatedRepairs: 0, tokens: { status: 'unavailable' } }, review: 'synthetic-test-only' },
    { taskId: 'task-beta', arm: 'C', order: 1, metrics: { errors: 0, userQuestions: 0, durationMs: 1180, evidenceQuality: 85, repeatedRepairs: 0, tokens: { status: 'unavailable' } }, review: 'synthetic-test-only' },
    { taskId: 'task-beta', arm: 'B', order: 2, metrics: { errors: 1, userQuestions: 0, durationMs: 1290, evidenceQuality: 80, repeatedRepairs: 1, tokens: { status: 'authoritative-receipt', value: 120, receiptId: 'synthetic-beta-b' } }, review: 'synthetic-test-only' },
    { taskId: 'task-beta', arm: 'A', order: 3, metrics: { errors: 1, userQuestions: 1, durationMs: 1150, evidenceQuality: 75, repeatedRepairs: 1, tokens: { status: 'unavailable' } }, review: 'synthetic-test-only' },
  ],
});

test('public offline sample is an honest pending-review template with fixed arms', async () => {
  const { fixture, profile } = await load();
  const validated = validateAbcEvaluation(fixture, profile);
  assert.equal(validated.status, 'pending-review');
  assert.deepEqual(validated.armIds, ['A', 'B', 'C']);
  assert.deepEqual(validated.taskIds, ['task-alpha', 'task-beta']);
  assert.equal(validated.tasks.length, 2);
  assert.match(validated.tasks[0].prompt, /authentication boundary/);
  assert.equal(validated.observations.length, 0);
  assert.equal(validated.profile.axes.length, 5);
  assert.ok(validated.profile.exactLiteralsProtection.includes('versions'));
  assert.deepEqual(validated.arms.map((arm) => arm.name), ['released-pinmind', 'superpowers-dyslex-protocol-descriptor', 'pinmind-readability-hybrid']);
});

test('synthetic test-only complete fixture reports qualified metrics and never claims universal superiority', async () => {
  const { fixture, profile } = await load();
  const result = evaluateAbc(syntheticCompletedFixture(fixture), profile, { verifyReceipt: verifySyntheticReceipt });
  assert.equal(result.ok, true); assert.equal(result.status, 'complete');
  assert.equal(result.claim, 'qualified-comparison-only');
  assert.equal(result.universalSuperiorityClaim, false);
  assert.equal(result.arms.A.metrics.tokens.status, 'unavailable');
  assert.equal(result.arms.B.metrics.tokens.status, 'authoritative-receipt');
  assert.equal(result.arms.B.metrics.tokens.verification, 'host-adapter');
  assert.equal(result.arms.B.metrics.tokens.value, 240);
  assert.equal(result.arms.B.metrics.tokens.receiptCount, 2);
  assert.equal(JSON.stringify(result).includes('synthetic-alpha-b'), false);
  assert.equal(result.arms.C.metrics.errors, 0);
});

test('token receipts fail closed without a host verifier and cannot be counted twice', async () => {
  const { fixture, profile } = await load(); const complete = syntheticCompletedFixture(fixture);
  rejectsCode(() => evaluateAbc(complete, profile), 'RECEIPT_VERIFIER_REQUIRED');
  rejectsCode(() => evaluateAbc(complete, profile, { verifyReceipt: () => false }), 'RECEIPT_NOT_VERIFIED');
  rejectsCode(() => evaluateAbc(complete, profile, { verifyReceipt: 'yes' }), 'INVALID_RECEIPT_VERIFIER');

  complete.observations[4].metrics.tokens.receiptId = complete.observations[1].metrics.tokens.receiptId;
  rejectsCode(() => evaluateAbc(complete, profile, { verifyReceipt: () => true }), 'DUPLICATE_RECEIPT');
});

test('privacy validation rejects owner paths and secret-shaped receipts without reflecting unsafe keys', async () => {
  const source = await load(); source.fixture = syntheticCompletedFixture(source.fixture);
  source.fixture.tasks[0].prompt = '/media/alice/private-project should be audited now';
  rejectsCode(() => validateAbcEvaluation(source.fixture, source.profile, { verifyReceipt: verifySyntheticReceipt }), 'PRIVATE_TEXT');

  source.fixture = syntheticCompletedFixture((await load()).fixture);
  source.fixture.observations[1].metrics.tokens.receiptId = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
  rejectsCode(() => validateAbcEvaluation(source.fixture, source.profile, { verifyReceipt: verifySyntheticReceipt }), 'PRIVATE_TEXT');

  source.fixture = syntheticCompletedFixture((await load()).fixture);
  source.fixture.tasks[0]['/media/alice/private-project'] = true;
  let error;
  try { validateAbcEvaluation(source.fixture, source.profile, { verifyReceipt: verifySyntheticReceipt }); }
  catch (caught) { error = caught; }
  assert.ok(error instanceof AbcEvaluationError);
  assert.equal(error.code, 'UNKNOWN_FIELD');
  assert.doesNotMatch(`${error.message}\n${JSON.stringify(error.details)}`, /media|alice|private-project/u);

  let cliError;
  try { await main(['--fixture', '/media/alice/private-project']); }
  catch (caught) { cliError = caught; }
  assert.ok(cliError instanceof AbcEvaluationError);
  assert.equal(cliError.code, 'INPUT_FILE_INVALID');
  assert.doesNotMatch(`${cliError.message}\n${JSON.stringify(cliError.details)}`, /media|alice|private-project/u);
});

test('pending-review is valid and does not fabricate results or tokens', async () => {
  const { fixture, profile } = await load(); const result = evaluateAbc(fixture, profile);
  assert.equal(result.ok, true); assert.equal(result.status, 'pending-review');
  assert.equal(result.claim, 'pending-review');
  assert.equal(result.observations, 0);
});

test('public main reads the fixture and returns the same qualified output', async () => {
  const result = await main([]);
  assert.equal(result.ok, true); assert.equal(result.claim, 'pending-review');
});

test('strict validator rejects privacy leaks, unknown fields, fabricated tokens, and mismatched arms', async (t) => {
  const source = await load(); source.fixture = syntheticCompletedFixture(source.fixture);
  const cases = [
    ['fixture unknown field', 'UNKNOWN_FIELD', (x) => { x.fixture.extra = true; }],
    ['profile unknown field', 'UNKNOWN_FIELD', (x) => { x.profile.extra = true; }],
    ['owner path', 'PRIVATE_TEXT', (x) => { x.fixture.tasks[0].prompt = '/home/alice/private-task should be audited now'; }],
    ['duplicate task id', 'INVALID_TASKS', (x) => { x.fixture.tasks[1].id = x.fixture.tasks[0].id; }],
    ['email', 'PRIVATE_TEXT', (x) => { x.fixture.arms[0].description = 'contact alice@example.com'; }],
    ['private key', 'PRIVATE_TEXT', (x) => { x.fixture.arms[0].description = '-----BEGIN PRIVATE KEY-----'; }],
    ['unknown metric', 'UNKNOWN_FIELD', (x) => { x.fixture.observations[0].metrics.extra = 1; }],
    ['fabricated tokens', 'INVALID_TOKENS', (x) => { x.fixture.observations[0].metrics.tokens = { status: 'estimated', value: 9 }; }],
    ['receipt lacks id', 'INVALID_TOKENS', (x) => { x.fixture.observations[0].metrics.tokens = { status: 'authoritative-receipt', value: 9 }; }],
    ['unavailable carries value', 'INVALID_TOKENS', (x) => { x.fixture.observations[0].metrics.tokens = { status: 'unavailable', value: 9 }; }],
    ['missing arm observation', 'MISSING_OBSERVATION', (x) => { x.fixture.observations.pop(); }],
    ['wrong task arm', 'UNKNOWN_TASK', (x) => { x.fixture.observations[0].taskId = 'task-gamma'; }],
    ['non-counterbalanced order', 'INVALID_ORDER', (x) => { x.fixture.ordering.orders[1] = ['A', 'B', 'C']; }],
    ['pending has fabricated observation', 'INVALID_PENDING_REVIEW', (x) => { x.fixture.status = 'pending-review'; }],
    ['profile loses identifier protection', 'INVALID_PROFILE', (x) => { x.profile.axes = x.profile.axes.filter((axis) => axis.id !== 'identifier-safety'); }],
    ['renamed arm', 'INVALID_ARMS', (x) => { x.fixture.arms[0].name = 'different'; }],
  ];
  for (const [name, code, mutate] of cases) await t.test(name, () => {
    const candidate = copy(source); mutate(candidate); rejectsCode(() => validateAbcEvaluation(candidate.fixture, candidate.profile, { verifyReceipt: verifySyntheticReceipt }), code);
  });
});
