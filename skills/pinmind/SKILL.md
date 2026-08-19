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

Check `.pinmind/active.json` before a new persistent run. Resume a matching unfinished run; the MVP allows one active run per workspace. See [safety.md](references/safety.md) for secrets, dirty trees, and production.

Keep specialist skills (PDF, Superpowers, `/design`, `/execute-plan`). Pinmind wraps them; it does not replace them.

## Loop

For `software-change` and `investigation`, follow [loop.md](references/loop.md): design or name 2–3 alternatives, observe a failing public-seam check, collect root-cause evidence before a fix, and run fresh verification before any "done" claim. Search the web or primary sources when the repo cannot settle the blocker. Parallelism only by the five-yes rule in [execution.md](references/execution.md).

## Finish

[verification.md](references/verification.md) splits completed, failed, unproven, and manual. Kernel structure is necessary and not sufficient. Commands: [kernel-cli.md](references/kernel-cli.md).

If Pinmind itself misroutes or produces bad evidence, capture a sanitized case first: [regression-inbox.md](references/regression-inbox.md).
