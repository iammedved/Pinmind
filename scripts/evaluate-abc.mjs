#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_KEYS = ['schemaVersion', 'id', 'status', 'tasks', 'ordering', 'arms', 'observations'];
const PROFILE_KEYS = ['schemaVersion', 'id', 'axes', 'exactLiteralsProtection'];
const AXIS_KEYS = ['id', 'rule'];
const ORDERING_KEYS = ['strategy', 'orders'];
const ARM_KEYS = ['id', 'name', 'description'];
const OBSERVATION_KEYS = ['taskId', 'arm', 'order', 'metrics', 'review'];
const METRIC_KEYS = ['errors', 'userQuestions', 'durationMs', 'evidenceQuality', 'repeatedRepairs', 'tokens'];
const TASK_KEYS = ['id', 'prompt'];
const REQUIRED_AXES = ['typo-tolerant-intent', 'identifier-safety', 'instruction-decoder', 'context-reentry', 'decision-comparator'];
const EXACT_LITERAL_RULE = 'Never silently change identifiers, commands, paths, URLs, versions, numbers, or literals.';
const MAX_INPUT_BYTES = 1024 * 1024;
const FIXED_ARMS = [
  { id: 'A', name: 'released-pinmind', description: 'Released PinMind controller without the optional readability profile.' },
  { id: 'B', name: 'superpowers-dyslex-protocol-descriptor', description: 'Protocol descriptor inspired by Superpowers plus dyslex.ai research, independently worded with no imports, copied prompts, or dependency.' },
  { id: 'C', name: 'pinmind-readability-hybrid', description: 'Released PinMind plus selected offline readability-profile guidance.' },
];
const PRIVATE_TEXT = /(?:\/(?:home|Users|media)\/[\w.-]+|\/run\/media\/[\w.-]+|\/mnt\/[a-z]\/Users\/[\w.-]+|[A-Za-z]:[\\/]Users[\\/][\w.-]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b|\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b|\b(?:api[_-]?key|secret|password|token)\s*[:=])/i;

export class AbcEvaluationError extends Error {
  constructor(code, details) { super(`${code}: ${details[0] || 'A/B/C evaluation failed'}`); this.name = 'AbcEvaluationError'; this.code = code; this.details = details; }
}

function fail(code, detail) { throw new AbcEvaluationError(code, [detail]); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function closed(value, keys, label) {
  if (!isObject(value)) fail('INVALID_SCHEMA', `${label} must be an object.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail('UNKNOWN_FIELD', `${label} contains an unknown field.`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('MISSING_FIELD', `${label}.${key}`);
}
function text(value, label, min = 1, max = 240) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail('INVALID_SCHEMA', `${label} must be a bounded non-empty string.`);
  if (PRIVATE_TEXT.test(value)) fail('PRIVATE_TEXT', label);
}
function integer(value, label, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail('INVALID_SCHEMA', `${label} out of range.`); }
function receiptVerifier(options) {
  if (options === undefined) return null;
  if (!isObject(options)) fail('INVALID_RECEIPT_VERIFIER', 'options must be an object.');
  const keys = Object.keys(options);
  if (keys.some((key) => key !== 'verifyReceipt')) fail('INVALID_RECEIPT_VERIFIER', 'options contains an unknown field.');
  if (options.verifyReceipt === undefined) return null;
  if (typeof options.verifyReceipt !== 'function') fail('INVALID_RECEIPT_VERIFIER', 'verifyReceipt must be a function.');
  return options.verifyReceipt;
}

function validateProfile(profile) {
  closed(profile, PROFILE_KEYS, 'profile'); if (profile.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA', 'profile.schemaVersion'); text(profile.id, 'profile.id', 6, 80);
  if (!Array.isArray(profile.axes) || profile.axes.length !== 5) fail('INVALID_PROFILE', 'profile.axes');
  const ids = [];
  profile.axes.forEach((axis, index) => { closed(axis, AXIS_KEYS, `profile.axes[${index}]`); text(axis.id, `profile.axes[${index}].id`, 3, 80); text(axis.rule, `profile.axes[${index}].rule`, 12, 320); ids.push(axis.id); });
  if (new Set(ids).size !== 5 || !REQUIRED_AXES.every((id) => ids.includes(id))) fail('INVALID_PROFILE', 'profile.axes must contain the five required axes.');
  if (profile.exactLiteralsProtection !== EXACT_LITERAL_RULE) fail('INVALID_PROFILE', 'profile.exactLiteralsProtection');
  return profile;
}

function validateTokens(tokens, label, context, verifyReceipt) {
  if (!isObject(tokens)) fail('INVALID_TOKENS', label); const keys = Object.keys(tokens); const status = tokens.status;
  if (status === 'unavailable') { if (keys.length !== 1 || !Object.hasOwn(tokens, 'status')) fail('INVALID_TOKENS', `${label} unavailable cannot carry a value.`); return { status }; }
  if (status === 'authoritative-receipt') {
    if (keys.length !== 3 || !Object.hasOwn(tokens, 'value') || !Object.hasOwn(tokens, 'receiptId')) fail('INVALID_TOKENS', `${label} receipt fields.`);
    integer(tokens.value, `${label}.value`, 0, 10000000); text(tokens.receiptId, `${label}.receiptId`, 6, 120);
    if (!verifyReceipt) fail('RECEIPT_VERIFIER_REQUIRED', `${label} requires a host receipt verifier.`);
    let verified = false;
    try { verified = verifyReceipt(Object.freeze({ receiptId: tokens.receiptId, value: tokens.value, taskId: context.taskId, arm: context.arm })) === true; }
    catch { fail('RECEIPT_NOT_VERIFIED', `${label} host receipt verification failed.`); }
    if (!verified) fail('RECEIPT_NOT_VERIFIED', `${label} was not verified by the host adapter.`);
    return { status, value: tokens.value, receiptId: tokens.receiptId };
  }
  fail('INVALID_TOKENS', `${label}.status`);
}

function validateObservation(item, index, taskIds, armIds, expectedOrder, verifyReceipt) {
  const label = `observations[${index}]`; closed(item, OBSERVATION_KEYS, label); text(item.taskId, `${label}.taskId`, 6, 80); text(item.arm, `${label}.arm`, 1, 1); text(item.review, `${label}.review`, 6, 120);
  if (!taskIds.includes(item.taskId)) fail('UNKNOWN_TASK', `${label}.taskId`); if (!armIds.includes(item.arm)) fail('UNKNOWN_ARM', `${label}.arm`);
  integer(item.order, `${label}.order`, 1, 3); if (item.order !== expectedOrder) fail('INVALID_ORDER', `${label}.order`);
  closed(item.metrics, METRIC_KEYS, `${label}.metrics`);
  integer(item.metrics.errors, `${label}.metrics.errors`, 0, 100); integer(item.metrics.userQuestions, `${label}.metrics.userQuestions`, 0, 100); integer(item.metrics.durationMs, `${label}.metrics.durationMs`, 0, 86400000); integer(item.metrics.evidenceQuality, `${label}.metrics.evidenceQuality`, 0, 100); integer(item.metrics.repeatedRepairs, `${label}.metrics.repeatedRepairs`, 0, 100);
  return { ...item, metrics: { ...item.metrics, tokens: validateTokens(item.metrics.tokens, `${label}.metrics.tokens`, { taskId: item.taskId, arm: item.arm }, verifyReceipt) } };
}

export function validateAbcEvaluation(fixture, profile, options = undefined) {
  const verifyReceipt = receiptVerifier(options);
  validateProfile(profile); closed(fixture, ROOT_KEYS, 'fixture');
  if (fixture.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA', 'fixture.schemaVersion'); text(fixture.id, 'fixture.id', 6, 80);
  if (!['complete', 'pending-review'].includes(fixture.status)) fail('INVALID_SCHEMA', 'fixture.status');
  if (!Array.isArray(fixture.tasks) || fixture.tasks.length < 1 || fixture.tasks.length > 24) fail('INVALID_TASKS', 'fixture.tasks');
  const taskIds = fixture.tasks.map((task, index) => {
    closed(task, TASK_KEYS, `fixture.tasks[${index}]`); text(task.id, `fixture.tasks[${index}].id`, 6, 80); text(task.prompt, `fixture.tasks[${index}].prompt`, 20, 2000); return task.id;
  });
  if (new Set(taskIds).size !== taskIds.length) fail('INVALID_TASKS', 'fixture.tasks contains duplicate ids.');
  closed(fixture.ordering, ORDERING_KEYS, 'fixture.ordering'); if (fixture.ordering.strategy !== 'counterbalanced') fail('INVALID_ORDER', 'fixture.ordering.strategy');
  if (!Array.isArray(fixture.ordering.orders) || fixture.ordering.orders.length !== taskIds.length) fail('INVALID_ORDER', 'fixture.ordering.orders');
  fixture.ordering.orders.forEach((order, index) => { if (!Array.isArray(order) || order.length !== 3 || new Set(order).size !== 3 || !['A', 'B', 'C'].every((id) => order.includes(id))) fail('INVALID_ORDER', `fixture.ordering.orders[${index}]`); });
  if (fixture.ordering.orders.length > 1 && new Set(fixture.ordering.orders.map((order) => order.join(''))).size < 2) fail('INVALID_ORDER', 'fixture.ordering.orders must vary.');
  if (!Array.isArray(fixture.arms) || fixture.arms.length !== 3) fail('INVALID_ARMS', 'fixture.arms');
  const armIds = fixture.arms.map((arm, index) => {
    closed(arm, ARM_KEYS, `fixture.arms[${index}]`); text(arm.id, `fixture.arms[${index}].id`, 1, 1); text(arm.name, `fixture.arms[${index}].name`, 3, 80); text(arm.description, `fixture.arms[${index}].description`, 12, 320);
    const fixed = FIXED_ARMS[index]; if (arm.id !== fixed.id || arm.name !== fixed.name || arm.description !== fixed.description) fail('INVALID_ARMS', `fixture.arms[${index}] must match the fixed A/B/C descriptor.`);
    return arm.id;
  });
  if (new Set(armIds).size !== 3 || !['A', 'B', 'C'].every((id) => armIds.includes(id))) fail('INVALID_ARMS', 'fixture.arms must be A, B, C.');
  if (!Array.isArray(fixture.observations) || fixture.observations.length > 72) fail('INVALID_OBSERVATIONS', 'fixture.observations');
  if (fixture.status === 'pending-review') { if (fixture.observations.length !== 0) fail('INVALID_PENDING_REVIEW', 'pending review cannot contain measured observations.'); return { ...fixture, profile, armIds, taskIds, observations: [] }; }
  const expected = taskIds.flatMap((taskId, taskIndex) => fixture.ordering.orders[taskIndex].map((arm, orderIndex) => ({ taskId, arm, order: orderIndex + 1 })));
  if (fixture.observations.length !== expected.length) fail('MISSING_OBSERVATION', 'complete evaluation requires one observation per task and arm.');
  const seen = new Set(); const observations = fixture.observations.map((item, index) => {
    const key = `${item.taskId}:${item.arm}`; if (seen.has(key)) fail('DUPLICATE_OBSERVATION', key); seen.add(key);
    const expectedItem = expected.find((candidate) => candidate.taskId === item.taskId && candidate.arm === item.arm);
    if (!expectedItem) { if (!taskIds.includes(item.taskId)) fail('UNKNOWN_TASK', `${item.taskId}`); fail('UNKNOWN_ARM', `${item.arm}`); }
    return validateObservation(item, index, taskIds, armIds, expectedItem.order, verifyReceipt);
  });
  if (expected.some((item) => !seen.has(`${item.taskId}:${item.arm}`))) fail('MISSING_OBSERVATION', 'missing task/arm pair.');
  const receiptIds = observations.filter((item) => item.metrics.tokens.status === 'authoritative-receipt').map((item) => item.metrics.tokens.receiptId);
  if (new Set(receiptIds).size !== receiptIds.length) fail('DUPLICATE_RECEIPT', 'authoritative receipt identifiers must be unique.');
  return { ...fixture, profile, armIds, taskIds, observations };
}

function aggregate(observations) {
  const sum = (key) => observations.reduce((total, observation) => total + observation.metrics[key], 0);
  const receipts = observations.filter((observation) => observation.metrics.tokens.status === 'authoritative-receipt');
  const unavailable = observations.some((observation) => observation.metrics.tokens.status === 'unavailable');
  return { errors: sum('errors'), userQuestions: sum('userQuestions'), durationMs: sum('durationMs'), evidenceQuality: observations.length ? sum('evidenceQuality') / observations.length : 0, repeatedRepairs: sum('repeatedRepairs'), tokens: receipts.length && !unavailable ? { status: 'authoritative-receipt', verification: 'host-adapter', value: receipts.reduce((total, observation) => total + observation.metrics.tokens.value, 0), receiptCount: receipts.length } : { status: 'unavailable' } };
}

export function evaluateAbc(fixture, profile, options = undefined) {
  const validated = validateAbcEvaluation(fixture, profile, options);
  if (validated.status === 'pending-review') return { ok: true, status: 'pending-review', claim: 'pending-review', universalSuperiorityClaim: false, observations: 0, arms: {} };
  const arms = Object.fromEntries(validated.armIds.map((arm) => [arm, { metrics: aggregate(validated.observations.filter((observation) => observation.arm === arm)) }]));
  return { ok: true, status: 'complete', claim: 'qualified-comparison-only', universalSuperiorityClaim: false, methodology: { sameSanitizedTaskIds: [...validated.taskIds], ordering: validated.ordering.strategy, tokenPolicy: 'host-verified-receipt-or-unavailable', profileAxes: REQUIRED_AXES }, observations: validated.observations.length, arms };
}

function parseArgs(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const options = { fixture: path.join(root, 'evals/fixtures/abc-sample.json'), profile: path.join(root, 'evals/readability-profile.json') };
  for (let index = 0; index < argv.length; index += 1) { const arg = argv[index]; if (arg !== '--fixture' && arg !== '--profile') fail('UNKNOWN_ARGUMENT', 'unsupported argument.'); const value = argv[++index]; if (!value || value.startsWith('--')) fail('MISSING_ARGUMENT', arg); options[arg.slice(2)] = path.resolve(value); }
  return options;
}
async function readBoundedJson(file, label) {
  let metadata; let source;
  try { metadata = await stat(file); }
  catch { fail('INPUT_FILE_INVALID', `${label} is unavailable.`); }
  if (!metadata.isFile() || metadata.size > MAX_INPUT_BYTES) fail('INPUT_FILE_INVALID', `${label} must be a regular JSON file no larger than ${MAX_INPUT_BYTES} bytes.`);
  try { source = await readFile(file, 'utf8'); }
  catch { fail('INPUT_FILE_INVALID', `${label} is unreadable.`); }
  if (Buffer.byteLength(source, 'utf8') > MAX_INPUT_BYTES) fail('INPUT_FILE_INVALID', `${label} exceeds the input limit.`);
  try { return JSON.parse(source); }
  catch { fail('INPUT_FILE_INVALID', `${label} is invalid JSON.`); }
}
export async function main(argv = process.argv.slice(2)) { const options = parseArgs(argv); return evaluateAbc(await readBoundedJson(options.fixture, 'fixture'), await readBoundedJson(options.profile, 'profile')); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'UNEXPECTED_ERROR', error: error.message, details: error.details || [] })}\n`); process.exitCode = 1; });
