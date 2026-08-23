import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeTask } from '../skills/pinmind/scripts/lib/decomposition.mjs';
import { routeTask } from '../skills/pinmind/scripts/lib/route.mjs';
import { main } from '../skills/pinmind/scripts/pinmind.mjs';

test('decomposition preserves the released primary route unchanged', () => {
  const input = { text: 'Составь план, реализуй изменение и открой PR.' };
  const result = decomposeTask(input);

  assert.deepEqual(result.primary, routeTask(input));
  assert.deepEqual(result.clauses.map(({ kind, position }) => ({ kind, position })), [
    { kind: 'read-only', position: 0 },
    { kind: 'local-mutation', position: 1 },
    { kind: 'external-effect', position: 2 },
  ]);
  assert.equal(Object.isFrozen(result.primary), false, 'the released router result is not rewritten or frozen');
});

test('decomposition is bounded, stable, diagnostic-only, and has no raw text field', () => {
  const input = { text: 'Проверь. Реализуй изменение. Открой PR. Запушь ветку. Смерджи PR.' };
  const first = decomposeTask(input, { maxClauses: 3 });
  const second = decomposeTask(input, { maxClauses: 3 });

  assert.deepEqual(first, second);
  assert.deepEqual(first.clauses, [
    { kind: 'read-only', position: 0 },
    { kind: 'local-mutation', position: 1 },
    { kind: 'external-effect', position: 2 },
  ]);
  for (const clause of first.clauses) assert.deepEqual(Object.keys(clause), ['kind', 'position']);
  assert.deepEqual(decomposeTask(input, { maxClauses: 1 }).clauses, [{ kind: 'read-only', position: 0 }]);
  assert.throws(() => decomposeTask(input, { maxClauses: 0 }), /maxClauses/u);
});

test('decomposition keeps protected commands, paths, URLs, identifiers, and literals intact', () => {
  const input = {
    text: 'Проверь `git push origin feature/a,b`; реализуй изменение в /srv/app/a,b.mjs; открой https://example.test/a,b?x=1; обработай ID-42.',
  };
  const result = decomposeTask(input);

  assert.deepEqual(result.clauses, [
    { kind: 'read-only', position: 0 },
    { kind: 'local-mutation', position: 1 },
    { kind: 'external-effect', position: 2 },
  ]);
  assert.equal(JSON.stringify(result).includes('feature/a,b'), false);
  assert.equal(JSON.stringify(result).includes('/srv/app'), false);
  assert.equal(JSON.stringify(result).includes('example.test'), false);
  assert.equal(JSON.stringify(result).includes('ID-42'), false);
});

test('conflicts and no-change wording stay conservative', () => {
  assert.deepEqual(
    decomposeTask({ text: 'Не изменяй исходники и не пушь ветку.' }).clauses,
    [],
  );
  assert.deepEqual(
    decomposeTask({ text: 'Do not change code, then push the branch.' }).clauses,
    [],
  );
  assert.deepEqual(decomposeTask({ text: 'неясный unsupported текст' }).clauses, []);
});

test('a completed marker makes the current phase authoritative without rewriting routeTask', () => {
  const historical = 'До CONTEXT_READY ничего не изменяй и не открывай PR.';
  const current = { text: 'CONTEXT_READY. После маркера реализуй изменения и открой PR.' };
  const result = decomposeTask(current);

  assert.equal(routeTask({ text: historical }).route, 'audit');
  assert.equal(result.primary.route, 'software-change');
  assert.equal(result.primary.signals.includes('authority:no-change'), false);
  assert.deepEqual(result.clauses.map((clause) => clause.kind), ['local-mutation', 'external-effect']);
});

test('CLI exposes decomposition only behind an explicit additive boolean flag', async () => {
  const input = 'Составь план, реализуй изменение и открой PR.';
  assert.deepEqual(await main(['route', '--text', input]), routeTask({ text: input }));
  assert.deepEqual(await main(['route', '--text', input, '--decompose']), decomposeTask({ text: input }));
  await assert.rejects(() => main(['route', '--text', input, '--decompose', 'yes']), (error) => error.code === 'INVALID_ARGUMENT');
});
