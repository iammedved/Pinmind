import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GOAL_CONTEXT_SCHEMA_VERSION,
  evaluateGoalContext,
  validateGoalContext,
} from '../skills/pinmind/scripts/lib/goal-context.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const absentContext = Object.freeze({ schemaVersion: 1, present: false });
const activeContext = Object.freeze({
  schemaVersion: 1,
  present: true,
  goalId: 'goal-0100',
  objective: 'Deliver the verified feature.',
  status: 'active',
  stoppingCondition: 'All checks pass.',
});

const expected = Object.freeze({ goalId: 'goal-0100' });

test('GoalContext schema v1 accepts only the versioned absent/present union', () => {
  assert.equal(GOAL_CONTEXT_SCHEMA_VERSION, 1);
  assert.deepEqual(validateGoalContext(absentContext), { ok: true, value: absentContext });
  assert.deepEqual(validateGoalContext(activeContext), { ok: true, value: activeContext });
});

test('standalone use is eligible when the host supplies no context or the absent union member', () => {
  for (const absent of [undefined, null, absentContext]) {
    assert.deepEqual(evaluateGoalContext(absent, expected), {
      eligible: true,
      mode: 'standalone',
      reason: 'no-goal-context',
    });
  }
});

test('matching active GoalContext is eligible without reflecting authority, evidence, objective, or condition', () => {
  const result = evaluateGoalContext(activeContext, expected);

  assert.deepEqual(result, {
    eligible: true,
    mode: 'goal-attached',
    reason: 'goal-active',
  });
  assert.doesNotMatch(JSON.stringify(result), /authorit|evidence|objective|condition|grant/i);
});

test('GoalContext rejects schema drift, mixed union members, deprecated host fields, types, and unknown statuses', () => {
  const cases = [
    [{ ...activeContext, schemaVersion: 2 }, /schemaVersion/i],
    [{ schemaVersion: 1, present: false, goalId: 'goal-0100' }, /unknown field/i],
    [{ schemaVersion: 1, present: true, goalId: 'goal-0100', objective: 'x', status: 'active', taskId: 'task-0100' }, /unknown field/i],
    [{ schemaVersion: 1, present: true, goalId: 'goal-0100', objective: 'x' }, /status.*required/i],
    [{ ...activeContext, present: 'true' }, /present/i],
    [{ ...activeContext, goalId: '' }, /goalId/i],
    [{ ...activeContext, objective: 10 }, /objective/i],
    [{ ...activeContext, stoppingCondition: null }, /stoppingCondition/i],
    [{ ...activeContext, status: 'archived' }, /status/i],
  ];

  for (const [candidate, pattern] of cases) {
    const result = validateGoalContext(candidate);
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
  }
});

test('GoalContext rejects control characters and overlong strings in every text field', () => {
  const overlong = 'x'.repeat(4_001);
  const cases = [
    [{ ...activeContext, goalId: 'goal\n0100' }, /control character/i],
    [{ ...activeContext, objective: 'Deliver\u0000feature' }, /control character/i],
    [{ ...activeContext, stoppingCondition: 'Done\tsoon' }, /control character/i],
    [{ ...activeContext, objective: overlong }, /too long/i],
    [{ ...activeContext, stoppingCondition: overlong }, /too long/i],
  ];

  for (const [candidate, pattern] of cases) {
    const result = validateGoalContext(candidate);
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
  }
});

test('non-active lifecycle statuses deterministically deny execution eligibility', () => {
  const expectedReasons = {
    paused: 'goal-paused',
    blocked: 'goal-blocked',
    complete: 'goal-complete',
  };

  for (const [status, reason] of Object.entries(expectedReasons)) {
    assert.deepEqual(evaluateGoalContext({ ...activeContext, status }, expected), {
      eligible: false,
      mode: 'goal-attached',
      reason,
    });
  }
});

test('optional expected binding permits only matching goalId and fails closed otherwise', () => {
  assert.deepEqual(evaluateGoalContext(activeContext), {
    eligible: true,
    mode: 'goal-attached',
    reason: 'goal-active',
  });

  assert.deepEqual(evaluateGoalContext(activeContext, { goalId: 'other-goal' }), {
    eligible: false,
    mode: 'goal-attached',
    reason: 'goal-context-goalId-mismatch',
  });

  assert.deepEqual(evaluateGoalContext(activeContext, { goalId: 'goal-0100', taskId: 'task-0100' }), {
    eligible: false,
    mode: 'goal-attached',
    reason: 'invalid-expected-goal-context',
  });
});

test('GoalContext module is pure and has no persistence, host command, filesystem, or network dependency', async () => {
  const source = await readFile(path.join(root, 'skills/pinmind/scripts/lib/goal-context.mjs'), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|http|https|net)|\b(?:fetch|writeFile|readFile|mkdir|rename|unlink|spawn|exec)\b|\/goal\b/i);
});
