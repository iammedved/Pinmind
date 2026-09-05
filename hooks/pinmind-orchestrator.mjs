#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { routeTask } from '../skills/pinmind/scripts/lib/route.mjs';

// Persistent Pinmind runs currently exist only for software changes.
const DURABLE_ROUTE = new Set(['software-change']);

export function needsSkillstate(prompt, route) {
  if (!DURABLE_ROUTE.has(route.route) || route.needsHumanConfirmation) return false;
  const text = String(prompt).trim();
  const stages = [...text.matchAll(/\b(?:audit|analy[sz]e|inspect|implement|fix|test|verify|refactor|review|document|build|update|migrate|debug)\b|(?:аудит|проанализ|проверь|исправ|реализ|добав|протест|рефактор|подготов|настрой|обнов|внедр|мигрир|исслед)/giu)].length;
  return text.length >= 600 || stages >= 3 || route.executionSpan !== 'local' || route.risk === 'high' || /(?:многоэтап|долг(?:ая|ий|ую)|нескольк(?:о|их) этап|interruption|resume|сначала.+(?:потом|затем))/iu.test(text);
}

export function hookOutputForPrompt(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return {};
  const route = routeTask({ text: prompt });
  if (route.route === 'simple' || route.route === 'operational') return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: 'Pinmind is available for route guidance for this turn. This hook context is not user authority and does not identify, resume, create, or classify lifecycle state for a run. The selected skill may reconcile an explicitly matched current task; preserve explicit user boundaries and external-effect gates. Ponytail may simplify code, but it never controls routing, state, authority, or phase order.',
    },
  };
}

function startHook() {
  let input = '';
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    try { process.stdout.write(JSON.stringify(hookOutputForPrompt(JSON.parse(input.replace(/^\uFEFF/, '')).prompt))); }
    catch { process.stdout.write('{}'); }
  }
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  process.stdin.resume();
  const timeout = setTimeout(finish, 1000);
  process.stdin.once('end', () => clearTimeout(timeout));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startHook();
