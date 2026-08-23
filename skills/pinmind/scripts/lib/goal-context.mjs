export const GOAL_CONTEXT_SCHEMA_VERSION = 1;

const absentFields = Object.freeze(['schemaVersion', 'present']);
const presentFields = Object.freeze([
  'schemaVersion',
  'present',
  'goalId',
  'objective',
  'status',
  'stoppingCondition',
]);
const expectedFields = Object.freeze(['goalId']);
const statuses = new Set(['active', 'paused', 'complete', 'blocked']);
const maxTextLength = 4_000;
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function findUnknownField(value, allowedFields) {
  return Object.keys(value).find((field) => !allowedFields.includes(field));
}

function validateText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') return `${field} must be a non-empty string`;
  if (value.length > maxTextLength) return `${field} is too long`;
  if (controlCharacters.test(value)) return `${field} contains a control character`;
  return null;
}

function validateShape(value, allowedFields, requiredFields, label) {
  if (!isPlainRecord(value)) return `${label} must be a plain object`;

  const unknown = findUnknownField(value, allowedFields);
  if (unknown) return `${label} contains unknown field ${unknown}`;

  for (const field of requiredFields) {
    if (!(field in value)) return `${label}.${field} is required`;
  }

  return null;
}

export function validateGoalContext(context) {
  if (!isPlainRecord(context)) return { ok: false, error: 'GoalContext must be a plain object' };
  if (context.schemaVersion !== GOAL_CONTEXT_SCHEMA_VERSION) {
    return { ok: false, error: `GoalContext.schemaVersion must equal ${GOAL_CONTEXT_SCHEMA_VERSION}` };
  }
  if (typeof context.present !== 'boolean') return { ok: false, error: 'GoalContext.present must be a boolean' };

  if (!context.present) {
    const shapeError = validateShape(context, absentFields, absentFields, 'GoalContext');
    return shapeError ? { ok: false, error: shapeError } : { ok: true, value: context };
  }

  const shapeError = validateShape(
    context,
    presentFields,
    ['schemaVersion', 'present', 'goalId', 'objective', 'status'],
    'GoalContext',
  );
  if (shapeError) return { ok: false, error: shapeError };

  for (const field of ['goalId', 'objective']) {
    const textError = validateText(context[field], `GoalContext.${field}`);
    if (textError) return { ok: false, error: textError };
  }

  if ('stoppingCondition' in context) {
    const textError = validateText(context.stoppingCondition, 'GoalContext.stoppingCondition');
    if (textError) return { ok: false, error: textError };
  }

  if (typeof context.status !== 'string' || !statuses.has(context.status)) {
    return { ok: false, error: 'GoalContext.status is not supported' };
  }

  return { ok: true, value: context };
}

export function validateExpectedGoalContext(expected) {
  const shapeError = validateShape(expected, expectedFields, expectedFields, 'expected GoalContext');
  if (shapeError) return { ok: false, error: shapeError };

  const textError = validateText(expected.goalId, 'expected GoalContext.goalId');
  return textError ? { ok: false, error: textError } : { ok: true, value: expected };
}

function result(eligible, mode, reason) {
  return { eligible, mode, reason };
}

export function evaluateGoalContext(context, expected = undefined) {
  if (context === undefined || context === null) return result(true, 'standalone', 'no-goal-context');

  const contextValidation = validateGoalContext(context);
  if (!contextValidation.ok) return result(false, 'goal-attached', 'invalid-goal-context');
  if (!context.present) return result(true, 'standalone', 'no-goal-context');

  if (expected !== undefined && expected !== null) {
    const expectedValidation = validateExpectedGoalContext(expected);
    if (!expectedValidation.ok) return result(false, 'goal-attached', 'invalid-expected-goal-context');
    if (context.goalId !== expected.goalId) {
      return result(false, 'goal-attached', 'goal-context-goalId-mismatch');
    }
  }

  if (context.status === 'active') return result(true, 'goal-attached', 'goal-active');
  return result(false, 'goal-attached', `goal-${context.status}`);
}
