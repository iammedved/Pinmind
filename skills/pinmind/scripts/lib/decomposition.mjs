import { routeTask, selectCurrentPhaseText } from './route.mjs';

const DEFAULT_MAX_CLAUSES = 8;
const MAX_MAX_CLAUSES = 16;

// This module is intentionally a diagnostic adapter: it neither grants
// authority nor writes request text to disk. The primary route remains the
// released router's complete, untouched result.
function protectedRanges(text) {
  const ranges = [];
  const patterns = [
    /`[^`]{0,2000}`/gu,
    /["“”«»][^"“”«»]{0,2000}["“”«»]/gu,
    /https?:\/\/[^\s,;]+/gu,
    /(?:^|\s)(?:\.{1,2}\/|\/)[A-Za-z0-9_./-]+/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

function protectedMask(text) {
  const chars = [...text];
  for (const [start, end] of protectedRanges(text)) {
    for (let index = start; index < end; index += 1) chars[index] = ' ';
  }
  return chars.join('');
}

function boundaries(masked) {
  const points = new Set([0, masked.length]);
  for (const match of masked.matchAll(/[.,;\n]+/gu)) points.add(match.index + match[0].length);
  // These connectors only divide diagnostics; commands and paths are already
  // masked, so their internal punctuation cannot become a boundary.
  const connector = /(?:^|\s*,?\s+)(?:and\s+then|then|and|и|затем|потом|далее)(?=\s)/giu;
  for (const match of masked.matchAll(connector)) points.add(match.index + match[0].length);
  return [...points].sort((a, b) => a - b);
}

function clauseKind(text) {
  const value = text.toLocaleLowerCase().replace(/ё/gu, 'е');
  if (/\b(?:open|create|submit)\s+(?:a\s+)?(?:pull\s+request|pr)\b|\b(?:push|merge|deploy|publish|release)\b|(?:откро|созда|оформ|запуш|пуш|смерж|слей|влей|задепло|опублик|релизн)\S*/u.test(value)) return 'external-effect';
  if (/\b(?:implement|develop|change|fix|add|edit|write\s+tests?)\b|(?:реализ|разработ|измен|исправ|добав|правк|напиш\S*\s+тест)/u.test(value)) return 'local-mutation';
  if (/\b(?:plan|audit|review|inspect|check|analyse|analyze|explain|wait|compare)\b|(?:план|состав\S*\s+план|аудит|ревью|проверь|провер|проанализ|объяс|дожд|сравн|прочита)/u.test(value)) return 'read-only';
  return null;
}

function conservativeNoChange(text) {
  const value = text.toLocaleLowerCase().replace(/ё/gu, 'е');
  const denial = /\b(?:do\s+not|don't|never|without)\b|(?:не\s+(?:изменя|меня|пуш|запуш|открыва|создава|мердж|смерж|дела)|ничего\s+не\s+(?:изменя|дела))/u.test(value);
  const action = /\b(?:change|implement|develop|fix|add|push|merge|open|create|deploy|publish)\b|(?:измен|реализ|разработ|исправ|добав|пуш|мердж|смерж|откро|созда|депло|опублик)/u.test(value);
  return denial && action;
}

function validateMaxClauses(maxClauses) {
  if (!Number.isInteger(maxClauses) || maxClauses < 1 || maxClauses > MAX_MAX_CLAUSES) {
    throw new TypeError(`maxClauses must be an integer between 1 and ${MAX_MAX_CLAUSES}`);
  }
}

/**
 * Returns a released-router result plus bounded, non-authorizing diagnostic
 * categories. Clause records deliberately contain no request excerpt, path,
 * URL, identifier, command, or literal, so callers cannot persist raw input
 * by serializing this result.
 */
export function decomposeTask(input = {}, { maxClauses = DEFAULT_MAX_CLAUSES, route = routeTask } = {}) {
  validateMaxClauses(maxClauses);
  if (typeof route !== 'function') throw new TypeError('route must be a function');

  const primary = route(input);
  const rawText = String(input.text || input.intent || input.request || '').normalize('NFKC');
  const text = selectCurrentPhaseText(rawText).text;
  if (!text.trim() || conservativeNoChange(text)) return { primary, clauses: [] };

  const masked = protectedMask(text);
  const points = boundaries(masked);
  const clauses = [];
  for (let index = 0; index < points.length - 1 && clauses.length < maxClauses; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const kind = clauseKind(masked.slice(start, end));
    if (kind) clauses.push({ kind, position: clauses.length });
  }
  return { primary, clauses };
}
