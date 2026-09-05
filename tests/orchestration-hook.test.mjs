import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { hookOutputForPrompt, needsSkillstate } from '../hooks/pinmind-orchestrator.mjs';

test('Pinmind hook offers non-authoritative routing guidance without lifecycle decisions', () => {
  assert.deepEqual(hookOutputForPrompt('Переведи слово hello.'), {});
  const short = hookOutputForPrompt('Проверь этот небольшой модуль и расскажи о найденных ошибках.');
  assert.match(short.hookSpecificOutput.additionalContext, /not user authority/);
  assert.match(short.hookSpecificOutput.additionalContext, /does not identify, resume, create, or classify lifecycle state/);
  const long = hookOutputForPrompt('Проведи аудит репозитория, исправь корень проблемы, добавь тесты и проверь итог во всех затронутых модулях.');
  assert.doesNotMatch(long.hookSpecificOutput.additionalContext, /skillstate/i);
  assert.match(long.hookSpecificOutput.additionalContext, /Ponytail may simplify code/);
  assert.doesNotMatch(long.hookSpecificOutput.additionalContext, /origin=pinmind/);
  const continuation = hookOutputForPrompt('Продолжай задачу.');
  assert.match(continuation.hookSpecificOutput.additionalContext, /does not identify.*lifecycle state/i);
});

test('Skillstate advisory classifier preserves confirmation and route boundaries without hook activation', () => {
  assert.equal(needsSkillstate('long '.repeat(200), { route: 'software-change', executionSpan: 'multi-system', risk: 'high', needsHumanConfirmation: true }), false);
  assert.equal(needsSkillstate('long '.repeat(200), { route: 'simple', executionSpan: 'multi-system', risk: 'high', needsHumanConfirmation: false }), false);
  assert.equal(needsSkillstate('аудит '.repeat(200), { route: 'audit', executionSpan: 'cross-cutting', risk: 'high', needsHumanConfirmation: false }), false);
  assert.equal(needsSkillstate('исследование '.repeat(200), { route: 'investigation', executionSpan: 'cross-cutting', risk: 'high', needsHumanConfirmation: false }), false);
  assert.equal(needsSkillstate('Проверь, исправь и протестируй.', { route: 'software-change', executionSpan: 'local', risk: 'medium', needsHumanConfirmation: false }), true);
});

test('plugin registers one bounded Pinmind orchestration hook', async () => {
  const hooks = JSON.parse(await readFile(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const registration = hooks.hooks.UserPromptSubmit[0].hooks[0];
  assert.equal(registration.type, 'command');
  assert.match(registration.command, /pinmind-orchestrator\.mjs/);
  assert.ok(registration.timeout > 0 && registration.timeout <= 5);
});
