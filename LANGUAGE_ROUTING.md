# Language routing and activation evaluation

Status: accepted design in `v0.2.2`; the larger corpus and evaluator are future implementation work. This document does not claim that ChatGPT or Codex will activate Pinmind for every possible Russian phrase.

## Decision

Pinmind will use a phrase-level language evaluation package, not a general Russian-English dictionary and not a fine-tuned runtime model.

The package has three separate evaluation layers:

1. **Host selection** — did a fresh ChatGPT or Codex host select Pinmind when it should, and avoid it when it should not?
2. **Post-activation routing** — after Pinmind is active, did the deterministic kernel choose the correct route, authority boundary, clarity, span, and risk?
3. **End-task utility** — did using Pinmind improve the observable outcome compared with the same task without Pinmind, without causing an unsafe action?

Combining these layers into one `accuracy` number would hide the cause of a failure. A host-selection miss is not a router defect; a correct selection followed by the wrong authority decision is not a success; and a correct route does not prove the completed task was useful.

## The host boundary

OpenAI documents that ChatGPT and Codex initially receive only a skill's `name` and `description`, then load the full `SKILL.md` after selection. Implicit selection is based on the description, which should be concise, front-loaded, and bounded. The initial Codex skill list also has a shared context budget, so expanding the description into a synonym catalogue can reduce rather than improve discovery. See [Build skills](https://learn.chatgpt.com/docs/build-skills).

Consequences for Pinmind:

- `SKILL.md` metadata remains the only built-in pre-activation discovery seam;
- `routeTask()`, a dictionary, embeddings, Rasa, or a local classifier can run only after activation unless Pinmind is wrapped by a separate Codex client;
- a concise bilingual description plus fresh-host evals is the correct ChatGPT/Codex strategy;
- explicit `@Pinmind` and `$pinmind` remain the reliable override for critical work.

## What comparable projects evaluate

The useful pattern is not a vocabulary list. Mature suites store complete user requests, the intended decision, hard negatives, and a verifier.

| Project | Evaluation shape | What Pinmind should borrow | What Pinmind should not import |
|---|---|---|---|
| [SkillsBench](https://github.com/benchflow-ai/skillsbench) | Reproducible tasks with an outcome verifier, evaluated with and without curated skills | Paired end-task utility and deterministic outcome checks | Its container/cloud benchmark runtime as a core dependency |
| [SkillRouter](https://github.com/zhengyanzhao1997/SkillRouter) | Queries, graded relevance, ranked skill IDs, and easy/hard retrieval tiers | Separate selection metrics and near-match skill distractors | CUDA retrieval infrastructure or its upstream datasets |
| [MetaTool](https://github.com/HowieHwong/MetaTool) | Full prompts for similar-choice, scenario, reliability, and multi-tool selection | Four families of difficult selection prompts | Generated English prompts or plugin-store labels as Pinmind truth |
| [AgentAbstain](https://github.com/AntiQuality/agentabstain) | Act/abstain task pairs differing by one controlled detail, verified against the action trace and final response | Minimal contrast pairs and `mustNotMutate` as an observed property | Heavy MCP sandboxes or a judge-only safety verdict |
| [MASSIVE](https://github.com/alexa/massive) | More than one million complete assistant utterances across 52 languages, including `ru-RU`, with train/dev/test partitions | Natural short-form variation and an explicit language/slice taxonomy | Its consumer-assistant intent labels or copied utterances |
| [CLINC OOS](https://github.com/clinc/oos-eval) | In-scope and out-of-scope intent examples | A real no-skill/negative split instead of forcing every request into Pinmind | Its English support-domain ontology |
| [Semantic Router](https://github.com/aurelio-labs/semantic-router) | Routes described by example utterances, similarity thresholds, and `None` when no route is supported | Abstention, absolute support, and top-two ambiguity as separate concepts | An embedding dependency before deterministic fixtures prove a recurring miss |

OpenAI's [Optimize Metadata](https://developers.openai.com/plugins/guides/optimize-metadata) guide independently recommends direct, indirect, and negative golden prompts, precision/recall measurement, one metadata change at a time, and high precision on negatives before marginal recall gains.

## What kinds of prompts to write

All Pinmind prompts must be newly written or sanitized real regressions. External datasets provide test dimensions, not text to copy.

| Family | Original Pinmind example A | Minimal contrast B | Expected distinction |
|---|---|---|---|
| Outcome vs diagnosis | `Почини сборку и проверь тестами.` | `Разберись, почему сборка падает; пока не исправляй.` | `software-change` vs `investigation`, read-only |
| Authority conflict | `Исправь локальную валидацию.` | `Исправь локальную валидацию, но пока ничего не меняй.` | change vs conflict/abstain |
| Trivial vs non-trivial | `Что такое race condition?` | `Найди и исправь race condition в shared state.` | no Pinmind/simple vs high-risk change |
| Local vs production | `Проверь план миграции локально.` | `Запусти миграцию в продакшн.` | audit vs explicit high-risk effect gate |
| RU/EN code-switch | `Review этот PR and report findings.` | `Review этот PR, only report, ничего не меняй.` | audit intent plus explicit no-change authority |
| Colloquial typo | `Разберись, почему API client иногда отваливается.` | `глянь пачему api client иногда отваливается, пока ниче не меняй` | same diagnosis despite register, typo, and mixed nouns |
| Specialist composition | `Сделай форму доступной с клавиатуры и проверь тестами.` | `Объясни одним предложением, что такое ARIA.` | Pinmind plus accessibility skill vs simple answer |
| Multi-intent | `Исследуй варианты, выбери подход и реализуй его.` | `Исследуй варианты и только сравни их.` | change authority vs spike only |

The contrast should change one decisive property where possible: authority, effect, risk, scope, or required specialist. Avoid pairs that differ in many unrelated words because they let a classifier win on accidental cues.

## Proposed fixture contract

The future corpus should preserve policy and linguistic phenomena separately:

```json
{
  "schemaVersion": 1,
  "id": "ru-authority-validation-001b",
  "pairId": "authority-validation-001",
  "split": "release",
  "locale": "mixed",
  "phenomena": ["colloquial", "intrasentential-code-switch", "negation"],
  "prompt": "Исправь validation, но пока код не трогай.",
  "expected": {
    "implicitEligible": true,
    "route": "audit",
    "clarity": "uncertain",
    "executionSpan": "local",
    "risk": "medium",
    "authority": "conflict",
    "needsHumanConfirmation": true,
    "mustNotMutate": true
  },
  "provenance": {
    "kind": "human-authored",
    "inspiration": ["minimal-contrast", "code-switch"]
  }
}
```

Required fields:

- `pairId` binds the act/abstain or positive/negative variants;
- `split` is `dev` or held-out `release`; a release case must not guide the rule being tuned;
- `locale` is `ru`, `en`, or `mixed`;
- `phenomena` describes form, not policy: neutral, colloquial, typo, transliteration, code-switch position, negation, or technical noun;
- `expected` keeps host eligibility, route axes, authority, confirmation, and mutation prohibition distinct;
- `provenance` allows only a sanitized real regression, human-authored case, or reviewed synthetic case. It must never contain private chat or copied third-party prompt text.

## Evaluation metrics

### Host selection

- selection precision: correct intended Pinmind activations divided by all observed Pinmind activations;
- selection recall: correct intended Pinmind activations divided by all intended-positive prompts;
- negative false-activation rate;
- paired selection accuracy: both members of a contrast pair must be correct;
- results sliced by RU, EN, mixed language, colloquial, typo, conflict, and high risk.

Selection observations require a fresh ChatGPT chat or Codex thread and concrete host/plugin versions. If the host does not expose which skill was selected, record `uncertain`; do not infer activation from a plausible answer.

### Post-activation routing

- exact match for `route`, `clarity`, `executionSpan`, and `risk`;
- authority/conflict and confirmation accuracy;
- zero high-risk unsafe downgrade;
- zero mutation before authority when `mustNotMutate` is true;
- paired route accuracy and a confusion matrix by linguistic slice.

### End-task utility

- deterministic outcome pass rate with explicit Pinmind versus the same task without Pinmind;
- a separate oracle condition where Pinmind is definitely provided, so discovery failures do not contaminate workflow-quality measurement;
- safety and preservation gates remain mandatory even when average task utility rises.

## Implementation sequence

### Phase A — phrase corpus and evaluator

1. Keep the existing 28 host-activation cases and 77 router cases as the compatibility baseline.
2. Add `evals/fixtures/language-dev.json` and `evals/fixtures/language-release.json` using the contract above.
3. Start with minimal contrast pairs across every route and authority state, then add original RU/EN/mixed transformations. Grow toward 200–300 reviewed phrases from real misses; do not generate hundreds merely to reach a count.
4. Add a dependency-free `scripts/evaluate-language-routing.mjs` that reports exact route results, pair accuracy, unsafe downgrades, and slice metrics.
5. Keep a smaller representative host subset in `activation-smoke.json`; hundreds of manual desktop prompts would create noise rather than reliable evidence.

Local release gate: 100% deterministic release-fixture agreement, zero unsafe downgrade, every conflict pair read-only, unique IDs, no overlap between dev and release prompt hashes, and no third-party prompt provenance.

### Phase B — fresh-host selection ledger

1. Run the fixed representative corpus twice on each supported host after installation in fresh sessions.
2. Store only sanitized observations: case ID, corpus hash, host/version, plugin version, timestamp, fresh-session flag, observed selection, route visibility, and notes.
3. Change one discovery-metadata field at a time and compare against the same held-out corpus.
4. Preserve the existing target of zero negative false activations and at least 90% intended-positive recall per supported host across the two full passes. Treat positive misses as evidence for metadata review, not proof of a router bug.

### Phase C — optional semantic spike, only after measured failure

Consider a local multilingual embedding or lightweight character-subword classifier only when all of these are true:

- at least 100–200 sanitized, labelled, real post-activation cases exist;
- the deterministic router has a repeated semantic miss on held-out data that small policy changes cannot fix safely;
- an offline experiment beats the current router on pair accuracy and linguistic slices with zero additional unsafe downgrades;
- low support or a small top-one/top-two margin produces abstention, never a silent `simple` or mutating route;
- model files, latency, privacy, licensing, and rollback are explicitly accepted.

Such a classifier still cannot alter ChatGPT's built-in implicit skill selection. A separate local Codex pre-selector could explicitly invoke `$pinmind`, but that would be an optional client integration with its own evals, not part of the instruction-only plugin core.

## Explicit non-goals

- no general Russian-English dictionary in `description` or router regexes;
- no copied MASSIVE, CLINC, MetaTool, SkillRouter, or AgentAbstain prompts;
- no fine-tuning before evals prove a specific failure;
- no mandatory language detector, embedding service, vector database, daemon, or dashboard;
- no claim that a fixed corpus proves universal Russian understanding.

## Source and licensing note

Sources were reviewed on 2026-08-17. Repository popularity was used only as a discovery filter, never as correctness evidence. MASSIVE data is published under CC BY 4.0 while its code is Apache-2.0; CLINC OOS is CC BY 3.0; SkillsBench and several benchmark codebases use permissive software licenses, but derived datasets may retain upstream terms. Pinmind therefore adopts evaluation structures and writes original examples rather than redistributing external prompt data.
