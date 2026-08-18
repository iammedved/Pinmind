#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeTask } from '../skills/pinmind/scripts/lib/core.mjs';

const TOP_KEYS = ['schemaVersion', 'split', 'cases', 'pairReviews'];
const CASE_KEYS = ['id', 'pairId', 'split', 'locale', 'phenomena', 'prompt', 'expected', 'provenance'];
const PAIR_REVIEW_KEYS = ['pairId', 'anchorTokens', 'dimension'];
const EXPECTED_KEYS = ['route', 'clarity', 'executionSpan', 'risk', 'authority', 'needsHumanConfirmation', 'mustNotMutate'];
const PROVENANCE_KEYS = ['kind', 'inspiration'];
const SPLITS = new Set(['dev', 'release']);
const LOCALES = new Set(['ru', 'en', 'mixed']);
const PHENOMENA = new Set(['neutral', 'colloquial', 'typo', 'transliteration', 'code-switch', 'negation', 'conflict', 'high-risk', 'production', 'credential', 'destructive', 'planning', 'reporting']);
const ROUTES = new Set(['simple', 'operational', 'spike', 'audit', 'investigation', 'software-change']);
const CLARITIES = new Set(['clear', 'uncertain', 'architectural']);
const SPANS = new Set(['local', 'cross-cutting', 'multi-system']);
const RISKS = new Set(['low', 'medium', 'high']);
const AUTHORITIES = new Set(['none', 'no-change', 'conflict', 'change', 'operational']);
const CONTRAST_DIMENSIONS = new Set(['route', 'clarity', 'executionSpan', 'risk', 'authority', 'needsHumanConfirmation', 'mustNotMutate']);
const PROVENANCE_KINDS = new Set(['human-authored', 'sanitized-regression']);
const INSPIRATIONS = new Set(['human-authored-contrast', 'sanitized-router-regression', 'minimal-contrast', 'authority-boundary', 'route-coverage', 'risk-boundary', 'language-variation', 'product-scope', 'host-eligibility']);
const HIGH_RISK_PHENOMENA = new Set(['high-risk', 'production', 'credential', 'destructive']);
const READ_ONLY_ROUTES = new Set(['simple', 'spike', 'audit', 'investigation']);
const PRIVATE_TEXT = /(?:\/home\/[\w.-]+|\/Users\/[\w.-]+|[A-Za-z]:[\\/]Users[\\/][\w.-]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export class LanguageEvaluationError extends Error {
  constructor(code, details) {
    super(`${code}: ${details[0] || 'language evaluation failed'}`);
    this.name = 'LanguageEvaluationError'; this.code = code; this.details = details;
  }
}

function fail(code, detail) { throw new LanguageEvaluationError(code, [detail]); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function assertClosedObject(value, keys, label) {
  if (!isObject(value)) fail('INVALID_SCHEMA', `${label} must be an object.`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail('UNKNOWN_FIELD', `${label}.${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('MISSING_FIELD', `${label}.${key}`);
}
function assertEnum(value, allowed, label) { if (!allowed.has(value)) fail('INVALID_ENUM', `${label}: ${String(value)}`); }
function assertBoolean(value, label) { if (typeof value !== 'boolean') fail('INVALID_SCHEMA', `${label} must be boolean.`); }
function assertString(value, label) { if (typeof value !== 'string' || !value.trim()) fail('INVALID_SCHEMA', `${label} must be a non-empty string.`); }

export function promptSha256(prompt) {
  return createHash('sha256').update(prompt.normalize('NFC').trim()).digest('hex');
}

function validateCase(candidate, split, index) {
  const label = `${split}.cases[${index}]`; assertClosedObject(candidate, CASE_KEYS, label);
  assertString(candidate.id, `${label}.id`); assertString(candidate.pairId, `${label}.pairId`); assertString(candidate.prompt, `${label}.prompt`);
  if (!/^[a-z0-9][a-z0-9-]{5,79}$/.test(candidate.id)) fail('INVALID_ID', `${label}.id`);
  if (!/^[a-z0-9][a-z0-9-]{5,79}$/.test(candidate.pairId)) fail('INVALID_PAIR', `${label}.pairId`);
  if (candidate.split !== split) fail('SPLIT_MISMATCH', `${label}.split`);
  assertEnum(candidate.locale, LOCALES, `${label}.locale`);
  if (!Array.isArray(candidate.phenomena) || candidate.phenomena.length === 0 || new Set(candidate.phenomena).size !== candidate.phenomena.length) fail('INVALID_PHENOMENA', `${label}.phenomena`);
  for (const phenomenon of candidate.phenomena) assertEnum(phenomenon, PHENOMENA, `${label}.phenomena`);
  if (PRIVATE_TEXT.test(candidate.prompt)) fail('PRIVATE_TEXT', `${label}.prompt`);

  assertClosedObject(candidate.expected, EXPECTED_KEYS, `${label}.expected`);
  assertEnum(candidate.expected.route, ROUTES, `${label}.expected.route`); assertEnum(candidate.expected.clarity, CLARITIES, `${label}.expected.clarity`);
  assertEnum(candidate.expected.executionSpan, SPANS, `${label}.expected.executionSpan`); assertEnum(candidate.expected.risk, RISKS, `${label}.expected.risk`);
  assertEnum(candidate.expected.authority, AUTHORITIES, `${label}.expected.authority`);
  assertBoolean(candidate.expected.needsHumanConfirmation, `${label}.expected.needsHumanConfirmation`); assertBoolean(candidate.expected.mustNotMutate, `${label}.expected.mustNotMutate`);
  if (candidate.phenomena.some((item) => HIGH_RISK_PHENOMENA.has(item)) && candidate.expected.risk !== 'high') fail('UNSAFE_EXPECTATION', `${label} high-risk phenomenon is below high.`);
  if (candidate.expected.authority === 'conflict' && (candidate.expected.route !== 'audit' || candidate.expected.clarity !== 'uncertain' || !candidate.expected.needsHumanConfirmation || !candidate.expected.mustNotMutate)) fail('INVALID_CONFLICT', label);
  if (READ_ONLY_ROUTES.has(candidate.expected.route) && !candidate.expected.mustNotMutate) fail('INVALID_MUTATION_BOUNDARY', label);
  if (candidate.expected.authority === 'no-change' && (!READ_ONLY_ROUTES.has(candidate.expected.route) || !candidate.expected.mustNotMutate)) fail('INVALID_MUTATION_BOUNDARY', `${label} no-change authority must remain read-only.`);
  if ((candidate.expected.route === 'software-change') !== (candidate.expected.authority === 'change')) fail('INVALID_AUTHORITY', `${label} software-change and change authority must agree.`);
  if ((candidate.expected.route === 'operational') !== (candidate.expected.authority === 'operational')) fail('INVALID_AUTHORITY', `${label} operational route and authority must agree.`);

  assertClosedObject(candidate.provenance, PROVENANCE_KEYS, `${label}.provenance`); assertEnum(candidate.provenance.kind, PROVENANCE_KINDS, `${label}.provenance.kind`);
  if (!Array.isArray(candidate.provenance.inspiration) || candidate.provenance.inspiration.length === 0) fail('INVALID_PROVENANCE', `${label}.provenance.inspiration`);
  for (const item of candidate.provenance.inspiration) {
    assertString(item, `${label}.provenance.inspiration`);
    if (!INSPIRATIONS.has(item)) fail('PROHIBITED_PROVENANCE', `${label}.provenance.inspiration`);
  }
  return { ...candidate, promptHash: promptSha256(candidate.prompt) };
}

function validateSplit(corpus, expectedSplit) {
  assertClosedObject(corpus, TOP_KEYS, expectedSplit);
  if (corpus.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA', `${expectedSplit}.schemaVersion`);
  assertEnum(corpus.split, SPLITS, `${expectedSplit}.split`); if (corpus.split !== expectedSplit) fail('SPLIT_MISMATCH', expectedSplit);
  if (!Array.isArray(corpus.cases) || corpus.cases.length !== 32) fail('INVALID_CASE_COUNT', `${expectedSplit} must contain exactly 32 cases.`);
  if (!Array.isArray(corpus.pairReviews) || corpus.pairReviews.length !== 16) fail('INVALID_PAIR_REVIEW', `${expectedSplit} must contain exactly 16 pair reviews.`);
  const pairReviews = corpus.pairReviews.map((review, index) => {
    const label = `${expectedSplit}.pairReviews[${index}]`; assertClosedObject(review, PAIR_REVIEW_KEYS, label);
    assertString(review.pairId, `${label}.pairId`); assertEnum(review.dimension, CONTRAST_DIMENSIONS, `${label}.dimension`);
    if (!Array.isArray(review.anchorTokens) || review.anchorTokens.length < 2 || review.anchorTokens.length > 6 || new Set(review.anchorTokens).size !== review.anchorTokens.length) fail('INVALID_PAIR_REVIEW', `${label}.anchorTokens`);
    for (const token of review.anchorTokens) if (typeof token !== 'string' || !/^\p{L}[\p{L}\p{N}]{2,}$/u.test(token)) fail('INVALID_PAIR_REVIEW', `${label}.anchorTokens`);
    return review;
  });
  const cases = corpus.cases.map((candidate, index) => validateCase(candidate, expectedSplit, index));
  const casePairIds = new Set(cases.map((item) => item.pairId)); const reviewPairIds = new Set(pairReviews.map((item) => item.pairId));
  if (reviewPairIds.size !== pairReviews.length || casePairIds.size !== reviewPairIds.size || [...casePairIds].some((pairId) => !reviewPairIds.has(pairId))) fail('INVALID_PAIR_REVIEW', `${expectedSplit} pair reviews must exactly match its case pairs.`);
  return { cases, pairReviews };
}

export function validateLanguageCorpora(devCorpus, releaseCorpus) {
  const devSplit = validateSplit(devCorpus, 'dev'); const releaseSplit = validateSplit(releaseCorpus, 'release');
  const dev = devSplit.cases; const release = releaseSplit.cases; const all = [...dev, ...release];
  const ids = new Set(); const hashes = new Map(); const pairSplits = new Map(); const pairs = new Map();
  for (const item of all) {
    if (ids.has(item.id)) fail('DUPLICATE_ID', item.id); ids.add(item.id);
    if (hashes.has(item.promptHash)) fail('DUPLICATE_PROMPT', `${hashes.get(item.promptHash)} and ${item.id}`); hashes.set(item.promptHash, item.id);
    if (pairSplits.has(item.pairId) && pairSplits.get(item.pairId) !== item.split) fail('CROSS_SPLIT_PAIR', item.pairId); pairSplits.set(item.pairId, item.split);
    const members = pairs.get(item.pairId) || []; members.push(item); pairs.set(item.pairId, members);
  }
  const reviewByPair = new Map();
  for (const review of [...devSplit.pairReviews, ...releaseSplit.pairReviews]) {
    if (reviewByPair.has(review.pairId)) fail('INVALID_PAIR_REVIEW', `${review.pairId} has duplicate reviews.`);
    reviewByPair.set(review.pairId, review);
  }
  for (const [pairId, members] of pairs) {
    if (members.length !== 2) fail('INVALID_PAIR', `${pairId} has ${members.length} members.`);
    if (members[0].locale !== members[1].locale) fail('INVALID_PAIR', `${pairId} changes locale.`);
    const tokens = (prompt) => new Set(prompt.toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean));
    const firstTokens = tokens(members[0].prompt); const secondTokens = tokens(members[1].prompt);
    const review = reviewByPair.get(pairId); if (!review) fail('INVALID_PAIR_REVIEW', `${pairId} has no review.`);
    if (!review.anchorTokens.every((token) => firstTokens.has(token) && secondTokens.has(token))) fail('INVALID_PAIR', `${pairId} does not preserve its reviewed subject anchors.`);
    if (members[0].expected[review.dimension] === members[1].expected[review.dimension]) fail('INVALID_PAIR', `${pairId} does not change reviewed dimension ${review.dimension}.`);
  }
  for (const pairId of reviewByPair.keys()) if (!pairs.has(pairId)) fail('INVALID_PAIR_REVIEW', `${pairId} reviews an unknown pair.`);
  const locales = new Set(all.map((item) => item.locale)); for (const locale of LOCALES) if (!locales.has(locale)) fail('MISSING_COVERAGE', `locale:${locale}`);
  const phenomena = new Set(all.flatMap((item) => item.phenomena));
  for (const phenomenon of ['colloquial', 'typo', 'negation', 'conflict', 'high-risk']) if (!phenomena.has(phenomenon)) fail('MISSING_COVERAGE', `phenomenon:${phenomenon}`);
  const routes = new Set(all.map((item) => item.expected.route)); for (const route of ROUTES) if (!routes.has(route)) fail('MISSING_COVERAGE', `route:${route}`);
  const authorities = new Set(all.map((item) => item.expected.authority)); for (const authority of AUTHORITIES) if (!authorities.has(authority)) fail('MISSING_COVERAGE', `authority:${authority}`);
  return { schemaVersion: 1, dev, release, all, pairs, pairReviews: reviewByPair, promptHashes: hashes };
}

function deriveAuthority(actual) {
  if (actual.signals.includes('authority:conflict')) return 'conflict';
  if (actual.signals.includes('authority:no-change')) return 'no-change';
  if (actual.route === 'operational') return 'operational';
  if (actual.route === 'software-change') return 'change';
  return 'none';
}
function caseResult(item, router) {
  const actualRoute = router({ text: item.prompt });
  const actual = {
    route: actualRoute.route, clarity: actualRoute.clarity, executionSpan: actualRoute.executionSpan, risk: actualRoute.risk,
    authority: deriveAuthority(actualRoute), needsHumanConfirmation: actualRoute.needsHumanConfirmation,
    mustNotMutate: READ_ONLY_ROUTES.has(actualRoute.route) || ['no-change', 'conflict'].includes(deriveAuthority(actualRoute)) || actualRoute.needsHumanConfirmation,
  };
  const compared = ['route', 'clarity', 'executionSpan', 'risk', 'authority', 'needsHumanConfirmation', 'mustNotMutate'];
  const mismatches = compared.filter((key) => actual[key] !== item.expected[key]).map((key) => ({ field: key, expected: item.expected[key], actual: actual[key] }));
  const highRiskCase = item.phenomena.some((entry) => HIGH_RISK_PHENOMENA.has(entry));
  const unsafeDowngrade = (item.expected.risk === 'high' || highRiskCase) && actual.risk !== 'high';
  const conflictMutation = item.expected.authority === 'conflict' && !actual.mustNotMutate;
  return { id: item.id, pairId: item.pairId, split: item.split, locale: item.locale, phenomena: item.phenomena, promptHash: item.promptHash, expected: item.expected, actual, pass: mismatches.length === 0 && !unsafeDowngrade && !conflictMutation, unsafeDowngrade, conflictMutation, mismatches };
}
function metric(results) { const passed = results.filter((item) => item.pass).length; return { total: results.length, passed, agreement: results.length ? passed / results.length : 0 }; }
function sliceMetrics(results) {
  const output = { locale: {}, phenomena: {} };
  for (const locale of LOCALES) { const slice = results.filter((item) => item.locale === locale); if (slice.length) output.locale[locale] = metric(slice); }
  for (const phenomenon of PHENOMENA) { const slice = results.filter((item) => item.phenomena.includes(phenomenon)); if (slice.length) output.phenomena[phenomenon] = metric(slice); }
  return output;
}

export function evaluateLanguageCorpora(devCorpus, releaseCorpus, router = routeTask) {
  const validated = validateLanguageCorpora(devCorpus, releaseCorpus);
  const cases = validated.all.map((item) => caseResult(item, router));
  const dev = cases.filter((item) => item.split === 'dev'); const release = cases.filter((item) => item.split === 'release');
  const pairResults = [...validated.pairs].map(([pairId]) => { const members = cases.filter((item) => item.pairId === pairId); return { pairId, split: members[0].split, caseIds: members.map((item) => item.id), pass: members.every((item) => item.pass), conflictCasesReadOnly: members.filter((item) => item.expected.authority === 'conflict').every((item) => item.actual.mustNotMutate) }; });
  const unsafeDowngrades = cases.filter((item) => item.unsafeDowngrade).map((item) => item.id); const conflictMutations = cases.filter((item) => item.conflictMutation).map((item) => item.id);
  const summary = {
    schemaVersion: 1, ok: cases.every((item) => item.pass) && unsafeDowngrades.length === 0 && conflictMutations.length === 0,
    dev: metric(dev), release: metric(release), overall: metric(cases), pairs: metric(pairResults), unsafeDowngrades, conflictMutations,
    slices: sliceMetrics(cases), pairResults, cases,
  };
  return summary;
}

export async function loadLanguageCorpora(devPath, releasePath) {
  return { dev: JSON.parse(await readFile(devPath, 'utf8')), release: JSON.parse(await readFile(releasePath, 'utf8')) };
}

function parseArgs(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const options = { dev: path.join(root, 'evals/fixtures/language-dev.json'), release: path.join(root, 'evals/fixtures/language-release.json') };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]; if (arg !== '--dev' && arg !== '--release') fail('UNKNOWN_ARGUMENT', arg);
    const value = argv[++index]; if (!value || value.startsWith('--')) fail('MISSING_ARGUMENT', arg); options[arg.slice(2)] = path.resolve(value);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv); const corpora = await loadLanguageCorpora(options.dev, options.release); return evaluateLanguageCorpora(corpora.dev, corpora.release);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) process.exitCode = 1; }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'UNEXPECTED_ERROR', error: error.message, details: error.details || [] })}\n`); process.exitCode = 1;
  });
}
