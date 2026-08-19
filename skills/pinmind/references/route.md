# Routing reference

## Contents

1. Eligibility
2. Classification axes
3. Route examples
4. Composition after routing
5. Escalation rules

## Eligibility

Apply the lightest route that still protects the outcome.

| Route | Choose when | Artifacts | Default verification |
|---|---|---|---|
| `simple` | One obvious, low-risk step; no tools or persistent context needed | none | answer sanity |
| `operational` | Copy, rename, format, select existing assets, run an agreed command, or make a typo-only edit without behavior change | none | inspect result |
| `spike` | Feasibility or an unknown must be tested before production design | optional finding | cheapest valid experiment |
| `audit` | User asks to inspect, explain, review, or report without changes | report only | evidence citations and current-state checks |
| `investigation` | Bug, failure, regression, or uncertain cause | delta contract when a fix is authorized | reproduce and isolate cause |
| `software-change` | Software behavior, interface, architecture, data flow, UX, or business rule changes | contract/evidence state | contract plus real journey |

Do not equate short wording with a simple task. Treat "fix the race," "deploy this," and "delete duplicates" as high-risk or substantive even when phrased in one sentence.

Never dump unrecognized, vague, or contradictory wording into `software-change`. Those cases stay `clarity: uncertain`, `needsHumanConfirmation: true`, and a read-only `audit` route until the user confirms the outcome. Classify paraphrases by intended outcome, not by the old fixture keywords.

Speech act beats nouns. Inspect, critique, review, and think-about stay `audit` even when the sentence mentions code, APIs, or optimization. `продумай` / `подумай` / `think about` is not an implement directive. A quality clause such as `чтобы он был более человечный` is not product-desire by itself. A plan followed by an explicit implement clause (`продумай план и начинай исправлять`) remains `software-change`.

## Classification axes

Classify independently:

- `clarity: clear` when outcome and behavior are determined.
- `clarity: uncertain` when multiple product branches remain.
- `clarity: architectural` when public boundaries or system shape change.
- `span: local` for one cohesive area and fast feedback.
- `span: cross-cutting` for multiple modules or shared state.
- `span: multi-system` for independent subsystems or integrations.
- `risk: low` for reversible local work.
- `risk: medium` for user-visible behavior or public API work.
- `risk: high` for authentication, payment, migration, deletion, permissions, concurrency, security, production, or irreversible effects.

Do not use a single SIMPLE/MEDIUM/COMPLEX score. Clarity controls questions, span controls execution boundaries, and risk controls evidence and review.

The kernel also returns:

- `signals`: stable names for observed intent, authority, impact, span, risk, and ambiguity cues;
- `confidence`: confidence in the route (`high`, `medium`, or `low`), not confidence that the work will succeed;
- `needsHumanConfirmation`: `true` only when a material contradiction or unresolved target cannot be settled by safe read-only discovery.

These fields explain a decision; they never authorize side effects. A conflicting request such as “улучши код, но ничего не меняй” stays read-only and requests confirmation. Architectural clarity takes precedence when public boundaries or system shape change, even if the design also contains uncertainty.

For repository collaboration, derive speech act, action, source/destination
target, authority, and external effect independently. A read-only PR review,
procedural question, negated action, or merge plan remains `audit`. When one
request contains planning and execution clauses, classify the executable clause
regardless of whether it appears before or after the plan.
An explicit confirmation or approval can make a following bounded action list
executable even when the list uses nominal forms, but that speech act alone does
not prove that the speaker is an owner or maintainer.
Creating a PR from existing work is `operational` with a
`remote-collaboration` effect. Merging or pushing to a shared or protected
branch is `operational/high`; a simultaneous request to change software keeps
the primary route `software-change` while retaining the external-effect
signals. Explicit owner or maintainer approval can resolve authority for the
named action and target, but it never lowers inherent risk. An unresolved merge
or push target sets `needsHumanConfirmation: true` and stays read-only until
clarified.

After Pinmind is active, use the kernel route record before route-dependent action when the kernel is available. Preserve one decision for the current scope; do not reclassify every assistant message. Re-run only after a user amendment or evidence changes route, span, or risk. When the kernel is unavailable, label model-only classification as a non-deterministic fallback.

## Route examples

| Request | Expected route |
|---|---|
| "Translate this sentence" / "Переведи это предложение" | simple |
| "Translate this sentence: The build is green." | simple; payload words do not create software impact |
| "Copy these six supplied images into the requested folder" | operational |
| "Can this library parse our legacy format?" | spike |
| "Review this PR and do not change code" / "Проверь репозиторий, ничего не меняй" | audit |
| "Compare Pinmind and Superpowers" / "кто лучше?" | audit; not unrecognized |
| "так и какие теперь мысли по поводу pinmind?" | audit; colloquial status question, not unrecognized |
| "мы в тупике, улучшить уже не имеет смысла?" | audit; value question, not a change order |
| "какое улучшение это дало" / "what improvement did that give us?" | audit; value question, not a change order |
| "напиши простыню... 1. root-cause evidence first." | audit; pasted diagnosis wording does not override the plan speech act |
| "выпили подсчет токенов" / "пуш на гитхаб" | software-change or operational by outcome; "пуш на гитхаб" is a remote push |
| "Prepare a plan for the pull request merge" | audit |
| "Create a pull request targeting main" | operational, clear/local/medium plus external-effect gate |
| "Merge PR #12 into protected main" | operational, clear/local/high plus external-effect gate |
| "Why does login sometimes return 500?" / "Диагностируй проблему, ничего не меняй" | investigation, no fix without authority |
| "Fix this local validation rule" | software-change, clear/local/medium |
| "Fix a race condition" | software-change, high; work loop still requires root-cause before the fix |
| "Build this landing page" | software-change, uncertain/local/medium |
| "Add payment processing" | software-change, uncertain/multi-system/high |
| "Run a production migration" | operational or substantive/high plus explicit side-effect gate |

## Composition after routing

Compose capabilities, not a mandatory list of named skills. A higher-priority instruction or mandatory domain skill always wins.

| Route | Capability to compose | Minimum evidence |
|---|---|---|
| `simple` | none unless a mandatory domain workflow applies | answer sanity |
| `operational` | file, artifact, or platform capability only when needed | inspected result and side-effect boundary |
| `spike` | primary-source research or throwaway prototype capability | cited finding or runnable experiment, labelled non-production |
| `audit` | relevant audit, security, accessibility, or artifact capability | current-state observations and direct citations |
| `investigation` | diagnosis plus the closest executable public-seam capability | a red-capable reproduction before root-cause claims |
| `software-change` | applicable domain skill plus test/review capability | contract evidence, regression checks, and the real user journey |

Avoid skill fan-out when one capability covers the seam. Add a specialist or subagent only when its independent evidence or context boundary repays the coordination cost.

## Escalation rules

Escalate when investigation reveals behavior change, public-boundary impact, hidden side effects, cross-module shared state, production scope, or evidence that invalidates an assumption. Record why.

Never downgrade merely to reduce process. Downgrade only when current evidence proves the original risk or span was overestimated, and keep the prior classification in state history.

Treat a no-change qualifier as an authority boundary, not as proof that the request is an audit. A root-cause or reproduction request remains `investigation`; an inspection or review plus a no-change qualifier is `audit`. A bounded sentence, phrase, or text translation is `simple`, while application, site, UI, or localization work remains `software-change`.

Classify Russian, English, mixed-language, colloquial, and mildly misspelled requests by intended outcome and consequence. Do not use a giant synonym dictionary. When a real phrasing is misrouted, add it to the regression corpus before changing policy.

Honor an explicit `audit` or `investigation` kind because both are non-mutating routes, while still deriving risk and span from the text. Never let explicit `simple` or `operational` downgrade high-risk or software-impacting work.

Use one-line progress wording such as:

```text
Route: software-change | clear/local/medium — user-visible validation behavior changes.
```
