---
name: pinmind
description: "Default RU/EN controller for every new Grok, Codex, or ChatGPT chat on non-trivial Russian or English tasks (задачи на русском или английском, including colloquial RU) requiring tools/files, multi-step reasoning, research/исследование, audit/аудит, diagnosis/диагностику, planning/планирование, implementation, or changes to code, UI, documents, data, integrations, or tests. Use implicitly at session start alongside required domain skills; after selection, load only this SKILL.md and immediately run the bundled route before memory, references, workspace inspection, or task tools. Do not use for greetings, one stable fact, tiny translation/rewrite, or trivial formatting."
---

# Pinmind

Deliver substantive outcomes through one adaptive controller. Treat the user's request as intent, the frozen contract as the normative outcome, and current evidence as the basis for completion. Keep process proportional and communicate in the user's language.

## Mandatory first action

Except for a higher-priority required skill-use announcement and loading this `SKILL.md`, run the bundled kernel router before the first substantive progress update, before reading any task reference or memory, before workspace inspection, and before any task tools or writes. The only permitted bootstrap work before routing is locating the bundled kernel and preparing the sanitized request input needed by `route --file`.

The request file must contain the full sanitized user wording under the exact `text` field; do not paraphrase it, rename the field, or add inferred authority:

```json
{"text":"<full sanitized user request>"}
```

```bash
node <skill-dir>/scripts/pinmind.mjs route --file <sanitized-request.json>
```

Prefer a private temporary file when the sandbox allows it. When the filesystem
is read-only, pass the exact same JSON object on standard input without creating
state:

```bash
printf '%s' '<sanitized-request-json>' | node <skill-dir>/scripts/pinmind.mjs route --file -
```

Do not fall back to `--text` for this bootstrap: it places the request in the
router process arguments. Standard input avoids that argv exposure but does not
make the request invisible to the host tool or its own audit log, so sanitize it
first in every mode. Never combine `--file` with `--text` or `--kind`; when file
or stdin JSON is used, an optional `kind` belongs inside that JSON object.

The first substantive progress update after any required skill-use announcement must begin `Route: <route> | <clarity>/<executionSpan>/<risk> — <reason>.` Preserve that machine-produced record for the current scope. Read the route-specific references and inspect the workspace only after this update. Re-run the router only after a material user amendment or discovered risk/span escalation.

If Node.js or the kernel is unavailable, make the first update begin `Route: non-deterministic fallback | ...`, explain the unavailable seam, and classify conservatively from [route.md](references/route.md). Never imply that the deterministic router ran.

## Start every triggered run

1. Preserve all higher-priority instructions, repository `AGENTS.md` rules, user permissions, and mandatory domain-skill workflows.
2. Use this skill as the controller around required domain skills; never replace a specialized workflow such as PDF, security, Figma, spreadsheet handling, Superpowers, or Grok `design` / `execute-plan`.
3. When the route is `simple`, answer directly without further reference or workspace reads. Otherwise read [route.md](references/route.md) after the mandatory router update, then compose only the capabilities and evidence required by the selected route. For `software-change` and `investigation`, also read [loop.md](references/loop.md).
4. Check for `.pinmind/active.json` in the active workspace before starting a new persistent run. Resume a matching unfinished run after validating its state; never rely on chat memory alone. The MVP permits one active run per workspace and blocks silent replacement.
5. Ask only about an unresolved choice that changes observable outcome, safety, authority, or a hard-to-reverse boundary. Otherwise record a reasonable assumption and continue.

Router fields explain handling but never grant authority. When `needsHumanConfirmation` is true, remain read-only until the contradiction or target is resolved. When `effect:external-side-effect` is present, remain read-only until the user gives exact current authority for that concrete target and effect. The signal does not set `needsHumanConfirmation` by itself and does not grant authority.

When changing discovery metadata, installation, or activation behavior, read [host-smoke.md](references/host-smoke.md) and keep host selection evidence separate from deterministic router evidence.

## Route proportionally

Use exactly one primary route:

- `simple`: answer directly. Create no process artifacts.
- `operational`: execute the requested mechanical action, verify proportionally, and create no Pinmind artifacts.
- `spike`: define one question, run the cheapest valid experiment, report the finding, and label or discard prototype work.
- `audit`: inspect and report only. Do not mutate unless the user explicitly expands authority.
- `investigation`: establish a failing feedback loop and root-cause evidence before proposing or implementing a fix.
- `software-change`: use the contract lifecycle when software behavior, interfaces, architecture, data flow, UX, or business rules change. For other multi-step deliverables, keep this controller active and use an inline outcome contract unless persistence materially protects the result.

Apply safety and authority gates before route convenience. An operational classification never authorizes a shared push, deployment, message, deletion, production migration, payment, credential change, or other external effect by itself.

For non-simple routes, record three independent axes in working state: `clarity` (`clear`, `uncertain`, `architectural`), `span` (`local`, `cross-cutting`, `multi-system`), and `risk` (`low`, `medium`, `high`). Escalate the route when new evidence requires it; never silently downgrade risk. Unclear, unrecognized, or contradictory wording stays `uncertain` and read-only until confirmed; never dump it into `software-change`.

## Work loop

After the route line, keep Superpowers' defining loop without extra artifacts on light routes:

- Design or name 2–3 alternatives before implementing a behavior change. A bounded change can be two sentences in chat; still stop for approval when the outcome is reversible only with effort.
- Observe a failing public-seam check before a production behavior change.
- Collect root-cause evidence before a fix.
- Run fresh verification before any "done" claim.

`simple` and `operational` stay a light no-artifact path: no `.pinmind` contract, no evidence store, no process files. Authority gates still block shared-branch push, deployment, deletion, production migration, payment, and credential changes.

## Build and freeze the outcome contract

For a software-change run, read [contract.md](references/contract.md) and use the bundled kernel when Node.js is available. Run it from the target workspace and provide a prepared brief source file:

```bash
node <skill-dir>/scripts/pinmind.mjs init --run <run-id> --brief <brief-source.md>
```

Use persistent `.pinmind` artifacts for substantive workspace changes. Keep local, low-risk reasoning inline when persistence would cost more than it protects, but never omit observable acceptance or verification. Never edit a frozen contract in place.

## Execute through evidence

Read [execution.md](references/execution.md) before changing substantive behavior.

Select one contract slice at a time. Prefer a vertical feedback loop:

```text
choose obligation -> observe valid failure -> implement minimum behavior
-> observe pass -> refactor without behavior drift -> record evidence
```

Test through public seams. Keep expected values independent from production logic. Preserve existing behavior explicitly in brownfield work. Work inline by default. A large coupled task is not a reason to spawn; admit parallelism only by the execution.md five-yes rule.

## Verify before claiming completion

Read [verification.md](references/verification.md) for any substantive or risky run.

Run fresh targeted checks and the broadest affordable regression checks. Verify four separate questions:

1. Did the contract cover the brief?
2. Does current evidence prove every MUST, invariant, preservation rule, and forbidden-change boundary?
3. Does the real user journey achieve the original goal? When fresh independent context is available, test this goal axis from the immutable brief and running outcome without exposing the contract; evaluate contract compliance separately. If only an inline check is possible, label it non-independent.
4. Is the whole change maintainable, safe, and internally consistent?

Never convert uncertainty into a pass by judgment alone.

## Break failing loops

Stop repeating the same strategy when the same failure class occurs twice, three repair rounds finish, scope expands materially, a new public boundary appears, evidence cannot distinguish success from failure, or the next action would be a guess.

Re-check the original request and current evidence. Search the web or primary sources when local docs and the repo cannot settle the blocker. Then change strategy or report the real gap.

When Pinmind itself misses activation, misroutes, downgrades unsafely, composes the wrong capability, or produces defective evidence/receipts, read [regression-inbox.md](references/regression-inbox.md). Preserve a sanitized reproducible case before changing metadata or policy; never self-edit merely because one task felt awkward.

## Protect the workspace

Read [safety.md](references/safety.md) for high-risk work, external side effects, secrets, migrations, production, or destructive operations.

Never erase a dirty tree, expose secrets in artifacts, weaken acceptance to make tests pass, or perform deployment, publication, payment, messaging, deletion, production migration, shared-branch push, or credential rotation without the user's required authority.

## Finalize honestly

Generate the final report from current artifacts and fresh evidence, not memory. See [verification.md](references/verification.md) for the completed, failed, unproven, and manual split.

Do not report token usage and do not read token-accounting references while finishing a task. Token counting is out of the skill and plugin surface so it cannot displace routing, contracts, or verification.

Use the bundled kernel for state, schema, trace, evidence, and freeze checks; see [kernel-cli.md](references/kernel-cli.md) for exact commands. Treat kernel validation as necessary but not sufficient: deterministic structure cannot replace product judgment or a real user journey.
