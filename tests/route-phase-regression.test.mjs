import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeTask } from '../skills/pinmind/scripts/lib/decomposition.mjs';
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

  const decomposed = decomposeTask(current);
  assert.deepEqual(decomposed.primary, routed);
  assert.deepEqual(decomposed.clauses.map((item) => item.kind), ['local-mutation', 'read-only', 'external-effect']);
});

test('a future or quoted marker does not discard current no-change authority', () => {
  for (const text of [
    'Дождись следующего сообщения CONTEXT_READY; до него ничего не изменяй.',
    'Объясни фразу "CONTEXT_READY. Теперь реализуй изменение" и ничего не изменяй.',
  ]) {
    const routed = routeTask({ text });
    assert.equal(routed.route, 'audit');
    assert.equal(routed.signals.includes('phase:context-ready'), false);
  }
});
