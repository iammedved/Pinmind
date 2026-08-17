---
name: pinmind
description: "Default RU/EN controller for non-trivial Russian or English tasks (задачи на русском или английском) requiring tools/files, multi-step reasoning, research/исследование, audit/аудит, diagnosis/диагностику, planning/планирование, implementation, or changes to code, UI, documents, data, integrations, or tests. Use implicitly alongside required domain skills; after selection, load only this SKILL.md and immediately run the bundled route before memory, references, workspace inspection, or task tools. Do not use for greetings, one stable fact, tiny translation/rewrite, trivial formatting, or other obvious one-step low-risk requests."
---

# Pinmind

Deliver substantive outcomes through one adaptive controller. Treat the user's request as intent, the frozen contract as the normative outcome, and current evidence as the basis for completion. Keep process proportional and communicate in the user's language.

## Mandatory first action

Except for a higher-priority required skill-use announcement and loading this `SKILL.md`, run the bundled kernel router before the first substantive progress update, before reading any task reference or memory, before workspace inspection, and before any task tools or writes. The only permitted bootstrap work before routing is locating the bundled kernel and creating the sanitized temporary request input needed by `route --file`.

The request file must contain the full sanitized user wording under the exact `text` field; do not paraphrase it, rename the field, or add inferred authority:

```json
{"text":"<full sanitized user request>"}
```

```bash
node <skill-dir>/scripts/pinmind.mjs route --file <sanitized-request.json>
```

The first substantive progress update after any required skill-use announcement must begin `Route: <route> | <clarity>/<executionSpan>/<risk> — <reason>.` Preserve that machine-produced record for the current scope. Read the route-specific references and inspect the workspace only after this update. Re-run the router only after a material user amendment or discovered risk/span escalation.

If Node.js or the kernel is unavailable, make the first update begin `Route: non-deterministic fallback | ...`, explain the unavailable seam, and classify conservatively from [route.md](references/route.md). Never imply that the deterministic router ran.

## Start every triggered run

1. Preserve all higher-priority instructions, repository `AGENTS.md` rules, user permissions, and mandatory domain-skill workflows.
2. Use this skill as the controller around required domain skills; never replace a specialized workflow such as PDF, security, Figma, or spreadsheet handling.
3. When the route is `simple`, answer directly without further reference or workspace reads. Otherwise read [route.md](references/route.md) after the mandatory router update, then compose only the capabilities and evidence required by the selected route.
4. Check for `.pinmind/active.json` in the active workspace before starting a new persistent run. Resume a matching unfinished run after validating its state; never rely on chat memory alone. The MVP permits one active run per workspace and blocks silent replacement.
5. Ask only about an unresolved choice that changes observable outcome, safety, authority, or a hard-to-reverse boundary. Otherwise record a reasonable assumption and continue.

Router fields explain handling but never grant authority. When `needsHumanConfirmation` is true, remain read-only until the contradiction or target is resolved.

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

For non-simple routes, record three independent axes in working state: `clarity` (`clear`, `uncertain`, `architectural`), `span` (`local`, `cross-cutting`, `multi-system`), and `risk` (`low`, `medium`, `high`). Escalate the route when new evidence requires it; never silently downgrade risk.

## Build and freeze the outcome contract

For a software-change run, read [contract.md](references/contract.md) and use the bundled kernel when Node.js is available. Run it from the target workspace and provide a prepared brief source file:

```bash
node <skill-dir>/scripts/pinmind.mjs init --run <run-id> --brief <brief-source.md>
```

Capture a sanitized immutable copy of the initial request. Preserve meaning and provenance, but never claim the stored copy is byte-for-byte original when secrets were redacted. Record later user additions as the authority for the next amendment and ensure new source quotes occur in that sanitized authority text. Derive obligations, observable acceptance criteria, invariants, preservation rules, boundaries, public seams, assumptions, canonical `outOfScope`, and planned evidence. The alias `exclusions` is invalid because an ignored scope field could silently weaken the contract. Keep private implementation choices out of the contract unless they are themselves required.

Run an independent `brief -> contract` coverage pass before freeze. Check for missing, narrowed, invented, contradictory, and untestable obligations. Freeze only when material forks are resolved or explicitly assumed. Never edit a frozen contract in place; create a versioned amendment and invalidate affected evidence.

Use persistent `.pinmind` artifacts for substantive workspace changes. Keep local, low-risk reasoning inline when persistence would cost more than it protects, but never omit observable acceptance or verification.

## Execute through evidence

Read [execution.md](references/execution.md) before changing substantive behavior.

Select one contract slice at a time. Prefer a vertical feedback loop:

```text
choose obligation -> observe valid failure -> implement minimum behavior
-> observe pass -> refactor without behavior drift -> record evidence
```

Test through public seams. Keep expected values independent from production logic. Preserve existing behavior explicitly in brownfield work.

Work inline by default. Create a work unit only when a boundary buys fresh context, independent acceptance, rollback, safe parallelism, distinct ownership, or specialist capability. Never create separate units merely for writing tests, running tests, or reviewing the same tiny change.

Use subagents only when the applicable user or repository instructions allow them and the payback is concrete. Give each one a narrow context bundle and non-overlapping write zone. Keep one owner for shared files. Review all returned work before integration.

## Verify before claiming completion

Read [verification.md](references/verification.md) for any substantive or risky run.

Run fresh targeted checks and the broadest affordable regression checks. Verify four separate questions:

1. Did the contract cover the brief?
2. Does current evidence prove every MUST, invariant, preservation rule, and forbidden-change boundary?
3. Does the real user journey achieve the original goal? When fresh independent context is available, test this goal axis from the immutable brief and running outcome without exposing the contract; evaluate contract compliance separately. If only an inline check is possible, label it non-independent.
4. Is the whole change maintainable, safe, and internally consistent?

Use only `pass`, `fail`, `uncertain`, `pending-review`, or `not-applicable`. Never convert uncertainty into a pass by judgment alone. For critical evidence, confirm sensitivity with a recorded RED, a negative control, assertion inspection, or another proportionate method.

Scale review by risk:

- low: self-review, targeted tests, diff sanity, final verification;
- medium: one combined contract, scope, quality, and evidence review;
- high: separate contract/evidence and quality/security/reliability reviews;
- non-trivial whole change: one fresh-eyes review of the integrated result.

Use one integrated fresh-eyes pass, never a review fan-out per file, obligation, or microstep. When the harness cannot provide a genuinely independent context, run the same whole-change checklist inline and disclose that the review was not independent.

## Break failing loops

Stop repeating the same strategy when the same failure class occurs twice, three repair rounds finish, scope expands materially, a new public boundary appears, evidence cannot distinguish success from failure, or the next action would be a guess.

Classify the blocker as a contract, design, decomposition, environment, evidence, or implementation defect. Rebuild the relevant invariant/state matrix, recut the work, amend the contract, change strategy, or report a real blocker. After a second concurrency or ordering symptom, stop symptom patches and model the full interleaving surface.

When Pinmind itself misses activation, misroutes, downgrades unsafely, composes the wrong capability, or produces defective evidence/receipts, read [regression-inbox.md](references/regression-inbox.md). Preserve a sanitized reproducible case before changing metadata or policy; never self-edit merely because one task felt awkward.

## Protect the workspace

Read [safety.md](references/safety.md) for high-risk work, external side effects, secrets, migrations, production, or destructive operations.

Never erase a dirty tree, expose secrets in artifacts, weaken acceptance to make tests pass, or perform deployment, publication, payment, messaging, deletion, production migration, shared-branch push, or credential rotation without the user's required authority.

## Finalize honestly

Read [token-usage.md](references/token-usage.md). Generate the final report from current artifacts and fresh evidence, not memory. Separate completed, failed, unproven, pending, assumed, amended, added, and manual items. Include exact verification commands and material limitations. Curate only stable reusable facts into durable project memory; never turn a session log or assumption into project truth.

For every task while Pinmind is active, including an explicitly or manually invoked `simple` route, end the user-facing final response with one token line:

- `Token usage: <observed total> (<source and available input/output breakdown>)` only when an authoritative host, SDK, CLI JSON event, App Server event, or API response exposed usage for the whole reported scope;
- `Token usage: unavailable — this surface did not expose authoritative usage for the whole task` otherwise.

Never estimate the number or substitute zero. The assistant's own final-response tokens normally become known only after that response completes, so an instruction-only ChatGPT/Codex skill will usually report `unavailable`. For persistent runs, keep the hash-checked receipt in `usage.json`; a supported post-turn observer may record actual usage later and `report` will render it without modifying the run.

Use the bundled kernel for state, schema, trace, evidence, and freeze checks; see [kernel-cli.md](references/kernel-cli.md) for exact commands. Treat kernel validation as necessary but not sufficient: deterministic structure cannot replace product judgment or a real user journey.
