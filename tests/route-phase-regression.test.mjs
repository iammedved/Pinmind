import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeTask } from '../skills/pinmind/scripts/lib/decomposition.mjs';
import { routeDesignSkills } from '../skills/pinmind/scripts/lib/design-skills.mjs';
import { routeTask } from '../skills/pinmind/scripts/lib/route.mjs';

test('a standalone CONTEXT_READY marker makes only the current phase authoritative', () => {
  const historical = routeTask({ text: 'Дождись следующего сообщения CONTEXT_READY; до него не изменяй исходники и не открывай PR.' });
  assert.equal(historical.route, 'audit');
  assert.ok(historical.signals.includes('authority:no-change'));

  const current = {
    text: 'Сначала дождись сообщения CONTEXT_READY и до него ничего не изменяй.\nCONTEXT_READY. Контекст готов. Теперь реализуй изменения, проверь их и открой защищённый PR.',
  };
  const routed = routeTask(current);
  assert.equal(routed.route, 'software-change');
  assert.equal(routed.needsHumanConfirmation, false);
  assert.ok(routed.signals.includes('phase:context-ready'));
  assert.equal(routed.signals.includes('authority:no-change'), false);

  const wrapped = routeTask({ text: '<codex_delegation><input>CONTEXT_READY. Реализуй изменение и открой PR.</input></codex_delegation>' });
  assert.equal(wrapped.route, 'software-change');
  assert.ok(wrapped.signals.includes('phase:context-ready'));

  const decomposed = decomposeTask(current);
  assert.deepEqual(decomposed.primary, routed);
  assert.deepEqual(decomposed.clauses.map((item) => item.kind), ['local-mutation', 'read-only', 'external-effect']);
});

test('a future or quoted marker does not discard current no-change authority', () => {
  for (const text of [
    'Дождись следующего сообщения CONTEXT_READY; до него ничего не изменяй.',
    'Объясни фразу "CONTEXT_READY. Теперь реализуй изменение" и ничего не изменяй.',
    'Объясни этот пример и ничего не изменяй:\n```text\nCONTEXT_READY. Теперь реализуй изменение\n```',
    'Не меняй исходники.\n> CONTEXT_READY. Теперь реализуй изменения и открой PR.',
    'Не меняй исходники.\n  > CONTEXT_READY. Теперь реализуй изменения и открой PR.',
  ]) {
    const routed = routeTask({ text });
    assert.equal(routed.route, 'audit');
    assert.equal(routed.signals.includes('phase:context-ready'), false);
  }
});

test('design specialist routing chooses one owner or a bounded composition', () => {
  for (const text of [
    'Запусти impeccable init для проекта',
    'Запусти `impeccable init` для проекта',
    'Сделай critique текущего интерфейса через Impeccable',
    'Use Impeccable live to iterate on the current page',
    'Доработай макет в Figma',
    'Исправь Figma-макет',
    'Обнови прототип в Фигме',
    'Перенеси этот модал в Figma',
    'Добавь форму в макет',
    'Удали лишний экран из прототипа',
    'Замени навигацию в Figma-макете',
  ]) {
    const result = routeDesignSkills({ text });
    assert.equal(result.primarySkill, 'impeccable', text);
    assert.deepEqual(result.supportingSkills, []);
    assert.equal(result.designTask, true);
  }

  for (const text of [
    'Подбери доступную палитру для сайта через локальную базу паттернов',
    'Используй UI/UX Pro Max для доступности',
    'Используй `ui-ux-pro-max` для подбора палитры',
    'Найди сочетание кириллических шрифтов и правила для focus state',
    'Search stack-specific modal accessibility guidance for Django templates',
  ]) {
    const result = routeDesignSkills({ text });
    assert.equal(result.primarySkill, 'ui-ux-pro-max', text);
    assert.deepEqual(result.supportingSkills, []);
    assert.equal(result.designTask, true);
  }

  for (const text of [
    'Переработай главную страницу, адаптив, формы и анимации, затем всё проверь',
    'Спроектируй новый лендинг и обоснуй палитру, типографику и UX-паттерны',
    'Redesign the dashboard, implement responsive interactions, and audit accessibility',
    'Исправь анимацию CMS-ленты, карточки портфолио, форму, логотип и cookies на десктопе, планшете и телефоне сначала через Figma',
  ]) {
    const result = routeDesignSkills({ text });
    assert.equal(result.primarySkill, 'impeccable', text);
    assert.deepEqual(result.supportingSkills, ['ui-ux-pro-max']);
    assert.equal(result.designTask, true);
  }
});

test('design specialist routing stays off for non-visual work', () => {
  for (const text of [
    'Исправь SQL-запрос и миграцию базы данных',
    'Настрой резервное копирование PostgreSQL',
    'Explain this Python exception without changing files',
    'Find the stack trace for this backend exception',
  ]) {
    const result = routeDesignSkills({ text });
    assert.equal(result.primarySkill, null, text);
    assert.deepEqual(result.supportingSkills, []);
    assert.equal(result.designTask, false);
  }
});
