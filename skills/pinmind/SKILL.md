---
name: pinmind
description: "Default RU/EN controller for non-trivial Russian or English work, including colloquial RU (разговорный русский): research/исследование, audit, diagnosis/диагностика, or code changes. After selection, load this SKILL.md and run the bundled route before memory, references, or task tools. Do not use for greetings, one stable fact, tiny translation, or trivial formatting."
---

# Pinmind

Classify the request, then do only as much process as the route needs. Speak the user's language.

## Mandatory first action

Except for a higher-priority required skill-use announcement and loading this `SKILL.md`, run the bundled kernel router before the first substantive progress update, before reading any task reference or memory, before workspace inspection, and before any task tools or writes.

```bash
node <skill-dir>/scripts/pinmind.mjs route --file <sanitized-request.json>
```

The file is `{"text":"<full sanitized user request>"}`. Prefer a private temp file. On a read-only filesystem: `printf '%s' '<json>' | node <skill-dir>/scripts/pinmind.mjs route --file -`. Do not pass the request on `--text` for this bootstrap. Never combine `--file` with `--text` or `--kind`.

Start the first progress update with the kernel record:

```text
Route: <route> | <clarity>/<executionSpan>/<risk> — <reason>.
```

If Node or the kernel is missing, start with `Route: non-deterministic fallback | ...` and classify conservatively from [route.md](references/route.md). Re-run only after a material user amendment or a discovered risk/span escalation.

## Route proportionally

Exactly one primary route. Details live in [route.md](references/route.md). When the route is `simple`, answer directly without further reference or workspace reads.

For a materially mixed request, `route --decompose` may add bounded diagnostic clauses (`read-only`, `local-mutation`, `external-effect`) around the unchanged primary route. Clauses never grant authority and never contain raw request excerpts. Decode dense or transferred instructions with [readability.md](references/readability.md).

| Route | Do |
|---|---|
| `simple` | Answer. Create no process artifacts. |
| `operational` | Do the mechanical action. Create no Pinmind artifacts. |
| `spike` | One question, cheapest valid experiment, label or discard the prototype. |
| `audit` | Inspect and report. Do not mutate unless the user expands authority. |
| `investigation` | Failing feedback loop and root-cause evidence before a fix. See [loop.md](references/loop.md). |
| `software-change` | Frozen outcome contract and evidence. See [contract.md](references/contract.md) and [loop.md](references/loop.md). |

`simple` and `operational` stay a light no-artifact path. Speech act beats nouns: inspect, critique, and think-about stay `audit` even if the text mentions code. Unclear or contradictory wording stays `audit` and read-only until confirmed; do not dump it into `software-change`. Router fields never grant authority.

Axes: `clarity` (`clear`, `uncertain`, `architectural`), `executionSpan` (`local`, `cross-cutting`, `multi-system`), `risk` (`low`, `medium`, `high`). Escalate when evidence requires it; never silently downgrade risk.

Ask only when an unresolved choice changes outcome, safety, authority, or a hard-to-reverse boundary. Otherwise record an assumption and continue.

## Stop

Remain read-only when `needsHumanConfirmation` is true, or when `effect:external-side-effect` is present until the user names the concrete target and effect. Operational routing never authorizes a shared push, deploy, message, deletion, production migration, payment, or credential change.

Check `.pinmind/active.json` before a new persistent run. Reconcile it read-only and resume only an explicitly identified matching unfinished run; never infer that an old pointer belongs to a new task. Optional Goal handling is defined in [goal-context.md](references/goal-context.md). The MVP allows one active run per workspace. See [safety.md](references/safety.md) for secrets, dirty trees, and production.

Keep specialist skills (PDF, Superpowers, `/design`, `/execute-plan`). Pinmind wraps them; it does not replace them.

## Durable state and code simplicity

Pinmind is the only workflow controller. The bundled `UserPromptSubmit` hook may mark a non-trivial request with `origin=pinmind` and decide whether it is durable enough for Skillstate. Never let Skillstate route the task, choose actions, or start its `run` controller beneath Pinmind.

When the hook selects durable state, keep `.pinmind` as the source of truth. After `init` and at clean contract, execution, verification, and final phase boundaries, run:

```bash
skillstate doctor --workspace <path>
skillstate checkpoint --workspace <path> --pinmind-run <run-id>
```

If either command fails, continue under Pinmind and report that durable checkpoints are unavailable; do not start a second controller. Skip Skillstate for short or one-step work. Ponytail may select the smallest code change and review over-engineering, but it never changes routing, authority, state, or phase order.

## UI design specialists

After the main route, if the request may design, change, review, or fix a visual interface, run the deterministic specialist router before loading a UI skill:

```bash
node <skill-dir>/scripts/pinmind.mjs design route --file <sanitized-request.json>
```

Follow its `primarySkill` and `supportingSkills` exactly. It selects only between the maintained `impeccable` workflow controller and the searchable `ui-ux-pro-max` knowledge skill. Load [design-skill-routing.md](references/design-skill-routing.md) when the result selects either skill. A `null` primary means neither applies. Specialist selection does not expand authority.

## Loop

For `software-change` and `investigation`, follow [loop.md](references/loop.md): design or name 2–3 alternatives, observe a failing public-seam check, collect root-cause evidence before a fix, and run fresh verification before any "done" claim. Select debugging, TDD, architecture, verification, and review proportionally from [methods.md](references/methods.md); Pinmind stays the controller. Search the web or primary sources when the repo cannot settle the blocker. Parallelism only by the five-yes rule in [execution.md](references/execution.md).

## Finish

[verification.md](references/verification.md) splits completed, failed, unproven, and manual. Kernel structure is necessary and not sufficient. Commands: [kernel-cli.md](references/kernel-cli.md).

If Pinmind itself misroutes or produces bad evidence, capture a sanitized case first: [regression-inbox.md](references/regression-inbox.md).

For controlled method comparisons, use the offline, receipt-aware protocol in [abc-evaluation.md](references/abc-evaluation.md). A pending experiment is not completion evidence.
