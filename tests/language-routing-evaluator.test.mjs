import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  LanguageEvaluationError, evaluateLanguageCorpora, main, promptSha256, validateLanguageCorpora,
} from '../scripts/evaluate-language-routing.mjs';

const devPath = fileURLToPath(new URL('../evals/fixtures/language-dev.json', import.meta.url));
const releasePath = fileURLToPath(new URL('../evals/fixtures/language-release.json', import.meta.url));
const load = async () => ({ dev: JSON.parse(await readFile(devPath, 'utf8')), release: JSON.parse(await readFile(releasePath, 'utf8')) });
const copy = (value) => structuredClone(value);
const rejectsCode = (action, code) => assert.throws(action, (error) => error instanceof LanguageEvaluationError && error.code === code);

test('language corpora have a closed 64-case, 32-pair, non-overlapping inventory', async () => {
  const corpora = await load(); const validated = validateLanguageCorpora(corpora.dev, corpora.release);
  assert.equal(validated.dev.length, 32); assert.equal(validated.release.length, 32); assert.equal(validated.all.length, 64); assert.equal(validated.pairs.size, 32); assert.equal(validated.promptHashes.size, 64);
  assert.equal(validated.pairReviews.size, 32);
  assert.equal(new Set(validated.all.map((item) => item.id)).size, 64); assert.ok(validated.all.every((item) => item.promptHash === promptSha256(item.prompt)));
  assert.deepEqual(new Set(validated.all.map((item) => item.locale)), new Set(['ru', 'en', 'mixed']));
  assert.deepEqual(new Set(validated.all.map((item) => item.expected.route)), new Set(['simple', 'operational', 'spike', 'audit', 'investigation', 'software-change']));
});

test('canonical evaluator reaches the frozen release gate and reports required slices', async () => {
  const corpora = await load(); const result = evaluateLanguageCorpora(corpora.dev, corpora.release);
  assert.equal(result.ok, true); assert.deepEqual(result.dev, { total: 32, passed: 32, agreement: 1 }); assert.deepEqual(result.release, { total: 32, passed: 32, agreement: 1 });
  assert.deepEqual(result.overall, { total: 64, passed: 64, agreement: 1 }); assert.deepEqual(result.pairs, { total: 32, passed: 32, agreement: 1 });
  assert.deepEqual(result.unsafeDowngrades, []); assert.deepEqual(result.conflictMutations, []); assert.ok(result.pairResults.every((item) => item.pass && item.conflictCasesReadOnly));
  for (const locale of ['ru', 'en', 'mixed']) assert.equal(result.slices.locale[locale].agreement, 1);
  for (const phenomenon of ['colloquial', 'typo', 'negation', 'conflict', 'high-risk']) assert.equal(result.slices.phenomena[phenomenon].agreement, 1);
});

test('public evaluator main emits the same passing release gate', async () => {
  const result = await main([]); assert.equal(result.ok, true); assert.equal(result.release.total, 32); assert.equal(result.release.agreement, 1); assert.equal(result.cases.length, 64);
});

test('an independently changed expected decision makes agreement fail', async () => {
  const corpora = await load(); const mutated = copy(corpora); const candidate = mutated.release.cases.find((item) => item.expected.route !== 'software-change'); candidate.expected.route = 'software-change'; candidate.expected.authority = 'change'; candidate.expected.mustNotMutate = false;
  const result = evaluateLanguageCorpora(mutated.dev, mutated.release); assert.equal(result.ok, false); assert.equal(result.release.passed, 31); assert.equal(result.release.agreement, 31 / 32);
  assert.ok(result.cases.find((item) => item.id === candidate.id).mismatches.length > 0);
});

test('unsafe risk downgrade and conflict mutation are explicit release failures', async () => {
  const corpora = await load();
  const unsafe = evaluateLanguageCorpora(corpora.dev, corpora.release, () => ({ route: 'software-change', clarity: 'clear', executionSpan: 'local', risk: 'medium', signals: ['intent:change'], needsHumanConfirmation: false }));
  assert.equal(unsafe.ok, false); assert.ok(unsafe.unsafeDowngrades.length > 0);
  const conflict = evaluateLanguageCorpora(corpora.dev, corpora.release, ({ text }) => {
    const fixture = [...corpora.dev.cases, ...corpora.release.cases].find((item) => item.prompt === text);
    if (fixture.expected.authority === 'conflict') return { route: 'software-change', clarity: 'clear', executionSpan: 'local', risk: fixture.expected.risk, signals: ['intent:change'], needsHumanConfirmation: false };
    return { route: fixture.expected.route, clarity: fixture.expected.clarity, executionSpan: fixture.expected.executionSpan, risk: fixture.expected.risk, signals: fixture.expected.authority === 'no-change' ? ['authority:no-change'] : fixture.expected.authority === 'operational' ? ['intent:operational'] : fixture.expected.authority === 'change' ? ['intent:change'] : [], needsHumanConfirmation: fixture.expected.needsHumanConfirmation };
  });
  assert.equal(conflict.ok, false); assert.ok(conflict.conflictMutations.length > 0);
});

test('schema and safety validator fails closed on independent negative mutations', async (t) => {
  const source = await load();
  const cases = [
    ['top-level unknown field', 'UNKNOWN_FIELD', (x) => { x.dev.extra = true; }],
    ['unsupported schema', 'UNSUPPORTED_SCHEMA', (x) => { x.dev.schemaVersion = 2; }],
    ['wrong split declaration', 'SPLIT_MISMATCH', (x) => { x.dev.split = 'release'; }],
    ['wrong case count', 'INVALID_CASE_COUNT', (x) => { x.dev.cases.pop(); }],
    ['wrong pair review count', 'INVALID_PAIR_REVIEW', (x) => { x.dev.pairReviews.pop(); }],
    ['pair review unknown field', 'UNKNOWN_FIELD', (x) => { x.dev.pairReviews[0].extra = true; }],
    ['pair review invalid anchor', 'INVALID_PAIR_REVIEW', (x) => { x.dev.pairReviews[0].anchorTokens = ['x', 'сборки']; }],
    ['pair review invalid dimension', 'INVALID_ENUM', (x) => { x.dev.pairReviews[0].dimension = 'semantic-intent'; }],
    ['pair reviews swapped across splits', 'INVALID_PAIR_REVIEW', (x) => { [x.dev.pairReviews[0], x.release.pairReviews[0]] = [x.release.pairReviews[0], x.dev.pairReviews[0]]; }],
    ['case unknown field', 'UNKNOWN_FIELD', (x) => { x.dev.cases[0].extra = true; }],
    ['invalid locale', 'INVALID_ENUM', (x) => { x.dev.cases[0].locale = 'de'; }],
    ['unknown phenomenon', 'INVALID_ENUM', (x) => { x.dev.cases[0].phenomena = ['unknown']; }],
    ['expected unknown field', 'UNKNOWN_FIELD', (x) => { x.dev.cases[0].expected.extra = true; }],
    ['unobservable host eligibility field', 'UNKNOWN_FIELD', (x) => { x.dev.cases[0].expected.implicitEligible = true; }],
    ['invalid authority', 'INVALID_ENUM', (x) => { x.dev.cases[0].expected.authority = 'maybe'; }],
    ['software-change lacks change authority', 'INVALID_AUTHORITY', (x) => { const item = x.dev.cases.find((candidate) => candidate.expected.route === 'software-change'); item.expected.authority = 'none'; }],
    ['operational route lacks operational authority', 'INVALID_AUTHORITY', (x) => { const item = x.dev.cases.find((candidate) => candidate.expected.route === 'operational'); item.expected.authority = 'none'; }],
    ['prohibited named provenance', 'PROHIBITED_PROVENANCE', (x) => { x.dev.cases[0].provenance.inspiration = ['MASSIVE']; }],
    ['prohibited generic external provenance', 'PROHIBITED_PROVENANCE', (x) => { x.dev.cases[0].provenance.inspiration = ['external benchmark prompts']; }],
    ['private Linux prompt text', 'PRIVATE_TEXT', (x) => { x.dev.cases[0].prompt = 'Inspect /home/private-user/notes.'; }],
    ['private Windows prompt text', 'PRIVATE_TEXT', (x) => { x.dev.cases[0].prompt = 'Inspect C:/Users/alice/private-note.txt.'; }],
    ['private macOS prompt text', 'PRIVATE_TEXT', (x) => { x.dev.cases[0].prompt = 'Inspect /Users/alice/private-note.txt.'; }],
    ['duplicate id', 'DUPLICATE_ID', (x) => { x.dev.cases[1].id = x.dev.cases[0].id; }],
    ['cross-split prompt overlap', 'DUPLICATE_PROMPT', (x) => { x.release.cases[0].prompt = x.dev.cases[0].prompt; }],
    ['cross-split pair overlap', 'INVALID_PAIR_REVIEW', (x) => { x.release.cases[0].pairId = x.dev.cases[0].pairId; x.release.cases[1].pairId = x.dev.cases[0].pairId; }],
    ['bad pair cardinality', 'INVALID_PAIR_REVIEW', (x) => { x.dev.cases[0].pairId = 'dev-unpaired-case'; }],
    ['pair loses reviewed subject anchors', 'INVALID_PAIR', (x) => { x.dev.cases[1].prompt = 'Привет unrelated automotive history from another topic.'; }],
    ['pair shares directive words but changes subject', 'INVALID_PAIR', (x) => { const item = x.dev.cases.find((candidate) => candidate.id === 'dev-06b'); item.prompt = 'Разберись пачему погода сегодня холодная.'; }],
    ['pair lacks decisive expected contrast', 'INVALID_PAIR', (x) => { x.dev.cases[1].expected = copy(x.dev.cases[0].expected); }],
    ['high-risk expectation downgraded', 'UNSAFE_EXPECTATION', (x) => { const item = x.dev.cases.find((candidate) => candidate.phenomena.includes('high-risk')); item.expected.risk = 'medium'; }],
    ['conflict permits mutation', 'INVALID_CONFLICT', (x) => { const item = x.dev.cases.find((candidate) => candidate.expected.authority === 'conflict'); item.expected.mustNotMutate = false; }],
    ['no-change authority permits mutation', 'INVALID_MUTATION_BOUNDARY', (x) => { const item = x.dev.cases.find((candidate) => candidate.expected.authority === 'no-change'); item.expected.route = 'software-change'; item.expected.mustNotMutate = false; }],
    ['authority coverage removed', 'MISSING_COVERAGE', (x) => {
      const all = [...x.dev.cases, ...x.release.cases]; for (const item of all) if (item.expected.authority === 'no-change') item.expected.authority = 'none';
      for (const corpus of [x.dev, x.release]) {
        const pairs = Object.groupBy(corpus.cases, (item) => item.pairId);
        for (const members of Object.values(pairs)) {
          const decisive = ['route', 'clarity', 'executionSpan', 'risk', 'authority', 'needsHumanConfirmation', 'mustNotMutate'];
          if (!decisive.some((key) => members[0].expected[key] !== members[1].expected[key])) members[1].expected.needsHumanConfirmation = !members[0].expected.needsHumanConfirmation;
          corpus.pairReviews.find((review) => review.pairId === members[0].pairId).dimension = decisive.find((key) => members[0].expected[key] !== members[1].expected[key]);
        }
      }
    }],
  ];
  assert.ok(cases.length >= 12);
  for (const [name, code, mutate] of cases) await t.test(name, () => { const candidate = copy(source); mutate(candidate); rejectsCode(() => validateLanguageCorpora(candidate.dev, candidate.release), code); });
});

test('64-case evaluator stays below its five-second local budget', async () => {
  const corpora = await load(); const started = performance.now(); const result = evaluateLanguageCorpora(corpora.dev, corpora.release); const elapsed = performance.now() - started;
  assert.equal(result.ok, true); assert.ok(elapsed < 5000, `elapsed ${elapsed}ms`);
});
