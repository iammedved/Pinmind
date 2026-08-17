# Pinmind roadmap

Research and prioritization date: 2026-08-17. This roadmap started after `v0.2.1`, was expanded for `v0.2.2` and the `v0.3.0` Adaptive Execution Policy, and was reprioritized against a fresh `v0.3.1-experimental` source/runtime audit. The P0/P1 implementation is released in `v0.4.0-experimental`; P2 follows the separate [adapter-first architecture decision](docs/p2-architecture.md). This file records candidate work; it does not authorize implementation or turn Pinmind into a workflow service.

## Released baseline

The current public baseline is `v0.4.0-experimental`. Its lineage starts with the following `v0.2.1` mechanisms, which were the main reason to study Superpowers, nick-vels/skills, and Matt Pocock's skills:

- deterministic post-activation RU/EN routing and proportional capability composition;
- RED/GREEN diagnosis, immutable briefs and contracts, amendments, traceable evidence, and blind goal-axis review;
- activation and routing corpora, a regression inbox, compact handoffs, and fresh-host smoke instructions;
- serialized canonical writes, physical path containment, bounded evidence commands, privacy-safe release staging, and actual-only token receipts;
- generated JSON/Markdown reports without a mandatory daemon, dashboard, MCP server, or external telemetry store.

`v0.2.2` adds a source-backed [language-routing design](LANGUAGE_ROUTING.md) and README hero, not a new classifier or runtime. The current architecture and the reviewed 100-star-or-more projects and forks are recorded in [design-decisions.md](skills/pinmind/references/design-decisions.md). Roadmap items below deliberately exclude capabilities already present in the published baseline.

`v0.3.0-experimental` adds the provider-neutral [Adaptive Execution Policy Phase 0](ADAPTIVE_EXECUTION_POLICY.md): a decision contract, 16 original synthetic contrast cases, a held-out split, and a deterministic validator. It does not select a concrete model, start agents, or change runtime execution. Shadow evaluation and any host-specific adapter remain future opt-in milestones.

`v0.3.1-experimental` was the security/portability patch baseline. A fresh audit confirmed that its deterministic bundled corpora and validators passed, but also reproduced gaps that those corpora did not cover. Therefore “released” and “green on the curated corpus” must not be read as “all real phrasing and interrupted-state behavior are proven.”

`v0.4.0-experimental` closes those reproduced P0/P1 defects and makes final checking observational. It does not implement P2 host dispatch, external-effect enforcement, or real-host activation measurement.

## Fresh audit correction

The audit changed the order of work because it found current correctness defects, not hypothetical enhancements:

- several natural RU/EN production-deletion and credential-effect phrases were classified below `high` risk;
- several read-only explanation, audit, and investigation phrases fell through to `software-change` or produced a false authority conflict;
- `state resume` reports a stored phase but does not replay, reconcile, or restart a failed task;
- loss or divergence of `active.json` can leave more than one state file marked `active`, and an explicitly named orphan can still appear resumable;
- The published baseline's `final verify` combines checking with finalization. P1 preserves that compatibility alias, adds pure `final check`, and also exposes explicit `finalize` for clearer new automation.

The writer lock, per-file atomic writes, hash validation, evidence/version gates, and fail-closed stale-lock behavior remain useful containment. They are not crash recovery. The roadmap must close the reproduced safety and single-active-run defects before optimizing token receipts or automatic model choice.

## Priority decision

The next release objective is **defect closure, then measured optimization**. First, turn the reproduced unsafe routes and split-brain scenario into RED fixtures and close them at their owning seams. Next, make verification observational and finalization explicit. Only after those invariants hold should Pinmind trial token accounting or Luna/Terra/Sol dispatch.

This order deliberately values correctness over sophistication. No initiative below requires a dashboard, daemon, vector database, background worker, model call that selects another model, or compulsory agent fan-out.

## Ranked initiatives

| Priority | Initiative | User value | Evidence | Complexity | Architectural fit | Admission or acceptance gate |
|---:|---|---|---|---|---|---|
| P0 | Routing safety and read-only intent regressions | Critical | Reproduced real-phrase misses | Low-medium | Excellent | 100% release agreement; zero production/destructive/credential downgrade; no read-only request becomes an authorized change |
| P0 | Single-active-run invariant and safe reconcile | Critical | Reproduced orphan/split-brain state | Medium | Excellent | At most one resumable active run; divergence fails closed with a non-mutating diagnostic |
| P1 | Crash-consistent transition journal and recovery protocol | High | Reproduced crash window plus durable-execution precedent | Medium-high | Strong if local | Fault injection at every multi-file boundary yields one reconciled state or one explicit recoverable stop |
| P1 | Baseline/evidence freshness and pure final check | High | Current API mutation and freshness gap | Medium | Excellent | `check` is idempotent/read-only; explicit `finalize` accepts only current required evidence |
| P2 | Hash-checked authorization receipts for external effects | High for deploy/publish/admin work | Strong, official HITL pattern | Medium | Strong | Start only after its usage/incident gate; exact action/target/scope match |
| P2 | Real-host activation ledger | Medium-high | Strong, official metadata/eval guidance | Low-medium | Excellent | Fixed corpus and host versions; zero false activation on negatives; explicit override remains supported |
| P2 | One-shot Codex post-turn receipt adapter | Medium | Strong, public terminal event | Low-medium | Excellent | Exact field equality; interrupted/malformed streams never produce `actual` usage |
| P2 | Opt-in Luna/Terra/Sol host dispatch adapter | Conditional efficiency gain | Official model guidance; local availability; no Pinmind outcome evidence yet | Medium | Strong outside core | Shadow and held-out edge tests prove no safety/evidence regression and a host-observed budget benefit |

P0 is release-blocking. P1 establishes trustworthy state and evidence. P2 remains optional and may never ship if its measured benefit does not exceed its maintenance and token cost. Architectural option review remains a proportional controller rule, not a product subsystem.

### Current implementation status

- **P0 is published on `main` at `e7cdbc6`:** 21 sanitized routing regressions extend the 98-case deterministic corpus, and canonical-active containment blocks orphan, split-brain, divergent-pointer, invalid-pointer, missing-run, and corrupt-run states. This repository fact does not by itself prove an installed-host or ChatGPT activation.
- **P1 crash-journal recovery is implemented:** the five bounded lifecycle mutations prepare one integrity-checked redo record; read-only reconcile diagnoses it, and explicit hash-bound recovery applies only allowlisted local Pinmind post-images. The suite covers at least 100 interruptions per transition plus a real `SIGKILL`/stale-lock restart.
- **P1 baseline, bounded freshness, and pure final check are implemented:** new runs require an explicit green, pre-existing-failure, or unavailable baseline receipt before freeze; required evidence may bind to at most 64 declared files; `final check` is read-only, while explicit `finalize` and the backward-compatible `final verify` alias finalize the run.
- These P1 seams restore and verify Pinmind's local state only. They never replay external commands or effects and do not claim host-process or real-world task restoration.

## P0. Routing safety and read-only intent regressions

Implement the accepted contract in [LANGUAGE_ROUTING.md](LANGUAGE_ROUTING.md): original full phrases rather than dictionary entries, minimal act/abstain pairs, RU/EN/mixed/colloquial/typo slices, explicit authority and `mustNotMutate`, and separate host-selection, post-activation-route, and end-task-utility measurements.

### Proposed seam

- Add versioned `dev` and held-out `release` phrase corpora without copying third-party prompts.
- Add a dependency-free evaluator for exact route axes, pair accuracy, unsafe downgrade, mutation prohibition, and slice metrics.
- Keep a smaller representative host-smoke subset; manual desktop observations remain distinct from deterministic router results.
- Use a no-skill, explicit/oracle Pinmind, and natural host-selection comparison when measuring end-task utility.
- Change metadata or router policy only after a reproducible RED case identifies the owning seam.
- Seed the regression inbox with the fresh audit misses before changing code: production/destructive aliases (`prod`, `прода`, `live`, `боевой`, `wipe`, `сотри`), credential rotation/effects, explanation-only requests, audit-only inspection, root-cause investigation, explicit no-change wording, and misleading literals such as `software-change` inside a diagnosis request.
- Treat unmatched or ambiguous intent as abstention/clarification or the narrowest read-only route; do not use `software-change` as a confident catch-all.

### Acceptance and stop conditions

1. Every release fixture is schema-valid, uniquely identified, absent from the development prompt-hash set, and backed by human-authored or sanitized-regression provenance.
2. Deterministic route/axes agreement is 100%, every conflict pair stays read-only, and no production deletion, destructive action, live credential effect, or equivalent high-risk case is classified below `high`.
3. Explanation/audit/investigation requests with no mutation authority never route as an authorized change and do not acquire a false confirmation conflict merely because they mention an effect.
4. Results are reported separately by RU, EN, mixed language, colloquial, typo, negation/conflict, and high-risk slices.
5. Do not introduce embeddings, a model classifier, or training until 100–200 sanitized real cases show a repeated held-out miss that the deterministic router cannot fix safely.
6. Do not grow a giant synonym list or change the concise discovery description merely to make local fixtures green; fresh-host selection is a separate gate.

## P0. Single-active-run invariant and safe reconcile

The kernel currently trusts `active.json` too much. An interrupted multi-file transition can leave an orphan state marked `active`; an explicit `state resume --run` can then report that orphan as resumable even when another run owns the active pointer. This is a reproduced split-brain defect, so the earlier “wait for evidence” gate is already satisfied.

### Proposed seam

- Make `init`, `resume`, every run mutator, and `finalize` validate one canonical active owner against both `active.json` and the bounded set of run state files.
- Require an explicitly named resume target to match the canonical active pointer. A stored `status: active` alone is insufficient.
- If the pointer is missing, points to a non-active run, disagrees with state, or more than one state is active, fail closed with the conflicting run IDs and next safe diagnostic step.
- Add `state reconcile --dry-run` first. It reports a deterministic repair plan but performs no silent deletion, status rewrite, lock reclamation, external command replay, or task retry.
- Keep stale/foreign lock handling fail-closed. Recovery must never kill an owner or remove a lock merely because its age looks suspicious.

### Acceptance and stop conditions

1. The reproduced orphan-pointer crash window cannot yield two resumable active runs.
2. Normal init/show/resume/mutate/finalize behavior remains valid for one canonical run.
3. Missing, malformed, divergent, and multiple-active cases return stable diagnostic codes and make no changes in dry-run mode.
4. Repair mode, if later added, requires an exact expected-state hash plus explicit local authority and is tested independently; do not bundle it into the first containment patch.
5. Do not claim task recovery: this seam restores state integrity and identifies the next safe step; it does not replay arbitrary external effects.

## P1. Crash-consistent local transitions and recovery protocol

The current writer lock serializes cooperating writers and each canonical file is written atomically, but a crash between several files can still strand an operation. Because the orphan/split-brain window is now reproduced, fault-injection design and the minimal prepare/commit/reconcile protocol are P1 work, not a conditional future idea. Cover only `init`, `freeze`, `amend`, evidence mutation, and finalization.

Borrow the durable-execution invariant—resume deterministically after interruption—from [Temporal](https://docs.temporal.io/) (accessed 2026-08-17), but do not import Temporal, a database, a worker service, or a workflow engine.

### Acceptance gate

- Add deterministic fault injection at every write boundary.
- Across at least 100 seeded interruption trials per multi-file transition, restart must either reconcile to one valid state or stop with one explicit recoverable error.
- Zero split-brain active runs, lost accepted evidence, or silently half-finalized runs.
- Recovery returns state integrity plus an explicit next safe step. It must not automatically rerun commands, deployments, messages, deletions, or other potentially non-idempotent effects.

## P1. Baseline/evidence freshness and pure final check

Pinmind stores command provenance, but `final verify` intentionally does not replay commands and cannot currently prove that arbitrary workspace changes did not happen after evidence capture. The next integrity step is a conservative freshness snapshot, not a universal time-to-live.

### Proposed seam

- Before mutation in a `software-change` route, record `baseline: green | pre-existing-failure | unavailable` from the narrowest affordable project check.
- Preserve a pre-existing failure verbatim and never attribute it to the new change.
- Attach a bounded fingerprint of at most 64 declared relevant files to each completion-critical verification snapshot, inside or outside Git. Record Git HEAD as diagnostic metadata only: unrelated commits must not stale evidence when every declared relevant file is byte-identical.
- Before completion, compare that snapshot with the current relevant state. A later relevant mutation marks the evidence stale until the planned check is captured again.
- When no trustworthy fingerprint is possible, state that freshness is manual or unavailable; do not silently pass.
- Add `final check`, which only computes and reports `pass | fail | uncertain`. Prefer `finalize` for explicit completion; it acquires the writer lock, rechecks the same gate, writes terminal artifacts, marks the run complete, and clears the active pointer. Keep the published `final verify` spelling as a deprecated finalizing compatibility alias.

This adopts the narrow useful part of Superpowers' baseline and verification discipline: success claims require current command evidence, not prior output. Sources: [using git worktrees](https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/SKILL.md) and [verification before completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) (accessed 2026-08-17). It does not mandate a worktree for every task.

### Acceptance and stop conditions

- Test green, pre-existing-red, unavailable, unrelated-dirty, relevant-post-check mutation, untracked artifact, and no-Git cases.
- Finalization fails closed only for required stale evidence; it must not erase or mislabel the original observation.
- Do not use an arbitrary age threshold. Fresh means “captured after the last relevant mutation in this run.”
- Repeated `final check` calls are byte-for-byte state-idempotent and never remove the active pointer; `finalize` and the deprecated `final verify` compatibility alias mutate lifecycle state.

## P2. Authorization receipts for external effects

Pinmind already requires explicit current authority for publishing, deploying, messaging, migration, deletion, and production/admin changes. The missing machine seam is a canonical record of what exact action and target were approved.

### Proposed seam

- For persistent medium/high-risk runs, record a hash-checked receipt containing the effect class, exact target/scope, contract hash, sanitized user authority, decision, and timestamp.
- Match the receipt inside a concrete effect adapter immediately before the governed action. Any changed action, target, scope, or contract invalidates it and requires new authority.
- Require an idempotency key or durable result identifier and persist `attempted | succeeded | failed | unknown`; never auto-retry an ambiguous external result.
- Treat rejection, ambiguity, or missing authority as a hard stop. Never infer approval from credentials, access, historical permission, or a broad “finish everything.”
- Keep the mechanism local and dependency-free; do not embed the Agents SDK.

The OpenAI Agents SDK HITL flow pauses sensitive calls, persists the pending decision in run state, and resumes only after approval or rejection. Pinmind can adopt that invariant without importing the runtime. Source: [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) (accessed 2026-08-17).

### Adoption gate

Begin implementation when either condition is recorded in the regression inbox:

1. at least three Pinmind runs in a rolling 30-day window reach an explicitly authorized deploy, push, migration, message/send, or delete effect; or
2. one reproduced incident shows that an approval's action, target, or scope was ambiguous or changed before execution.

Until one threshold is met, the existing prose gate remains mandatory and the new artifact would be premature overhead.

## P2. Real-host activation ledger

`v0.2.2` records the phrase-level corpus contract; the existing 28-case activation-smoke corpus remains the starting host sample. The next host step is to record fresh outcomes over time without confusing host selection with deterministic routing.

### Proposed seam

- Select a compact representative subset from the versioned `dev` and held-out `release` language corpora.
- Store only closed-schema sanitized result records: plugin artifact and metadata hashes, host/version, corpus version/hash and case ID, fresh-session flag, intended eligibility, explicit/implicit mode, observed activation, route-policy version, route, timestamp, and result classification.
- Exclude free-form notes, prompts, responses, traces, and personal paths; they add privacy and review cost without improving the metric.
- Change one metadata field at a time and compare precision/recall against the same held-out set.
- Treat a positive host miss as a discovery regression signal, not as proof that the post-activation router is wrong. No public event currently guarantees that an implicitly selected skill can be identified on every host.

OpenAI says implicit discovery begins with only the skill name and description and recommends concise, front-loaded scope and boundaries. Its metadata guide recommends direct, indirect, and negative golden prompts, precision/recall tracking, one change at a time, and prioritizing precision on negatives. Sources: [Build skills](https://learn.chatgpt.com/docs/build-skills) and [Optimize Metadata](https://developers.openai.com/plugins/guides/optimize-metadata) (accessed 2026-08-17).

### Pilot threshold

- Store the exact held-out corpus version and SHA-256 plus a supported-host manifest. The initial matrix is Codex CLI and ChatGPT Desktop; record the concrete host/app versions used, and do not silently count an untested surface as supported.
- Execute at least two independent fresh sessions over the same fixed corpus on each listed host. Treat the result as bounded pilot evidence, not a statistically universal support claim.
- Deterministic router: 100% of release cases and no high-risk unsafe downgrade.
- Host smoke: zero false activation in negative observations and every selected conflict observation stays audit/read-only with confirmation. Record positive-selection recall, misses, and confidence limits; do not turn a two-pass percentage into a marketing guarantee.
- Explicit `@Pinmind`/`$pinmind` remains the reliable override; never advertise 100% capture of arbitrary Russian wording.

## P2. One-shot Codex post-turn receipt adapter

### Proposed seam

- Accept a public `codex exec --json` stream or launch one explicit Codex turn as a foreground wrapper.
- Forward the normal assistant result; wait for exactly one successful terminal `turn.completed` event.
- Copy `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, and `reasoning_output_tokens` without reinterpretation. Derive Pinmind's total only by its documented input-plus-output rule.
- Optionally write the existing hash-checked `usage.json` with `scope: turn` for an explicit run and print the exact post-turn token line after the model response. Never overwrite a broader authoritative receipt.
- Store no raw prompt or assistant body by default. Persist only sanitized event provenance and the usage fields.
- Keep `unavailable` for failed, interrupted, ambiguous, missing, or unsupported streams.

The Codex SDK defines token usage on `turn.completed`, which is normally emitted after the assistant response. That sequencing is why an instruction-only skill cannot place its own exact final total into the response before completion, but a foreground observer can show it immediately afterward. See the [Codex SDK event types](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts) (accessed 2026-08-17).

### Acceptance and stop conditions

1. Fixture coverage reproduces all five public usage fields exactly and rejects negative, inconsistent, duplicate-terminal, truncated, and failed streams.
2. Twenty successful real CLI turns produce receipts equal to their terminal event payloads; ten interrupted or malformed trials produce no false `actual` receipt.
3. The adapter is opt-in, foreground-only, dependency-light, and never parses private rollout files.
4. The ordinary ChatGPT/Codex skill path remains valid without it and still reports `unavailable` when the host exposes nothing authoritative.
5. Do not add a dashboard as part of this initiative.

## Proportional architectural option review

For `clarity: architectural` plus a hard-to-reverse public or cross-cutting seam, compare at least two viable interface shapes on locality, migration cost, testability, reversibility, and public surface before freezing the chosen contract. Record why the selected shape won.

This is a proportional adaptation of Matt Pocock's [Design It Twice](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/DESIGN-IT-TWICE.md) (accessed 2026-08-17). Multiple subagents are optional and justified only when independent designs buy real diversity; ordinary refactors stay inline.

## P2. Opt-in Luna/Terra/Sol host dispatch adapter

Concrete model selection belongs to a future host adapter for the existing provider-neutral [Adaptive Execution Policy](ADAPTIVE_EXECUTION_POLICY.md), not to `route` or Pinmind core. The adapter is a deterministic lookup over a frozen `routeSnapshot`, bounded probe signals, AEP profile, host-reported capabilities, and a versioned local budget envelope. It makes no model call to choose a model and never inspects raw chat history merely to dispatch work.

Its default rule is the cheapest already-validated model that satisfies the work unit's quality, evidence, capability, and authority constraints—not the cheapest model in isolation.

The official [OpenAI model catalog](https://developers.openai.com/api/docs/models) positions Sol for complex professional work, Terra as the balanced intelligence/cost model, and Luna for cost-sensitive high-volume work. That is a starting hypothesis, not proof for Pinmind. Model availability, effort levels, prices, latency, and context limits are host observations and must be discovered or configured; they must not be frozen as universal policy facts.

### Initial decision contract

| AEP admission | Initial model | Initial effort | Boundary |
|---|---|---|---|
| `bounded-fast`; `direct` or `programmatic`; low/medium risk; deterministic oracle | `gpt-5.6-luna` | `low` | One bounded attempt; no fan-out |
| `balanced-execution` | `gpt-5.6-terra` | `medium` | Default for ordinary exploration, implementation, and review |
| `deep-decision` with evidence conflict, repeated semantic failure, or cross-cutting ambiguity | `gpt-5.6-sol` | `high` | One declared decision/work unit with an independent oracle |
| `exceptional-decision` at an explicitly authorized hard-to-reverse boundary | `gpt-5.6-sol` | `xhigh` or host-supported `max` | Rare admission; human authority and strict budget required |

Risk and reasoning complexity remain separate axes. A high-risk mechanical action still needs exact user authority and verification; it does not automatically need Sol. Conversely, an architectural read-only decision may justify Sol without granting any mutation authority. Missing authority or a missing oracle is a stop/confirmation condition, not a reason to buy more reasoning.

The adapter must not rewrite the route, lower risk, grant authority, choose multi-agent work, remove confirmation, or execute an external effect. It remains shadow-only until the host exposes a verified pre-turn model-selection hook. `simple` work does not require a dispatch artifact. Unsupported effort values degrade to the nearest explicitly allowed host capability and are recorded; host-specific extras are never assumed portable.

### Escalation and fallback

1. Luna may hand off to Terra only after its declared oracle fails, scope expands, or the task no longer satisfies `bounded-fast` admission.
2. Terra may hand off to Sol only for recorded `evidence-conflict`, a distinct repeated semantic failure after strategy change, or an explicitly authorized high-impact decision boundary.
3. A probe that changes intent, risk, authority, or execution span requires a fresh deterministic route before model selection changes.
4. Allow at most one upward model handoff per work unit. A second semantic failure stops for decomposition, changed evidence, or human review; it does not start an unbounded retry ladder.
5. Luna unavailable: use Terra/medium. Terra unavailable: use Sol/medium only if the same unit remains within budget. Sol unavailable for deep/exceptional work: allow Terra/high only for reversible work with an independent oracle; otherwise stop or defer.
6. Never silently downgrade an unfinished deep/exceptional unit, and never transfer authority merely because the receiving model is stronger.

Retries for transient transport/rate-limit errors are a separate, small host policy with a fixed attempt cap. They do not count as evidence that a semantic strategy should be repeated.

### Compact handoff contract

Transfer references, not accumulated conversation. A receiving model gets only:

- opaque work-unit ID and policy version;
- frozen contract-slice hash, objective, current phase, and allowed paths/effects;
- route axes, risk, `mustNotMutate`, and authority status;
- declared oracle and required evidence;
- bounded failure/escalation reason;
- references to relevant workspace artifacts and unresolved questions.

Do not copy full prompts, chain-of-thought, model-to-model transcripts, raw source trees, command logs, credentials, or unrelated context. The receiver reloads only referenced evidence from the workspace. A handoff returns `accept | decline | stop`, a reason code, and any missing reference; it cannot renegotiate the frozen contract.

### Budget, telemetry, and rollback

- Use local `small`, `standard`, and `exceptional` envelopes that cap attempts, model handoffs, optional reviewers, elapsed time, and authoritative host-exposed usage. Do not embed a price table.
- Persist only an opt-in sanitized receipt: policy version, planned profile, actual model/effort, escalation reason, oracle, outcome, authoritative usage or `unavailable`, and host-observed elapsed time or `unavailable`.
- Store no prompt, response, source text, raw trace, command arguments, credential, estimated token count, inferred cost, or self-awarded quality score.
- Keep the adapter feature-flagged and off by default. Disabling it immediately returns selection to the ordinary host configuration without changing contracts or deleting receipts.

### Shadow evaluation and adoption gate

Phase 2 remains counterfactual: it recommends a model/profile but changes no execution. Evaluate each edge separately on frozen development and held-out real-work slices with deterministic or independently reviewable oracles.

Start with one canary edge: Luna/low for `bounded-fast`. Terra remains the operational default. Enable an edge only if held-out evidence shows zero unsafe downgrade, no loss of required evidence, no increase in unresolved failures, and a host-observed latency/token/cost benefit under the local envelope. Test the same workload at the same reasoning effort and one lower setting before increasing effort, as recommended by OpenAI.

Sol admission remains shadow-only until a decision-quality gap is demonstrated against Terra/high. Roll an edge back to shadow after any reproduced safety downgrade, contract mismatch, receipt-integrity failure, or missed budget stop. Synthetic classification accuracy alone is not a quality or savings claim.

## Deferred until evidence exists

### Static local dashboard

Do not build one now. Reconsider only after both conditions hold:

1. at least 50 authoritative post-turn receipts exist; and
2. at least three recurring decisions per month cannot be answered by the JSON/Markdown report.

If those gates are met, start with generated static read-only HTML over sanitized receipts. No raw prompts, write actions, daemon, public endpoint, or MCP server by default. A UI cannot manufacture token telemetry that the host never exposed.

### Policy-as-data and public JSON Schemas

Extract stable precedence/effect classes into versioned data only after a second real policy change makes the JS matcher difficult to review. Publish JSON Schemas only when a second consumer—CI, an independent viewer, or another skill—needs to validate artifacts. Avoid two hand-maintained sources of truth.

### Mutation testing

Add mutation testing for route precedence, validation, locks, containment, and final gates after the P0 regression corpus is stable enough that the runtime cost is justified. Resume/reconcile work is no longer deferred because a split-brain state has been reproduced.

## Explicitly rejected

- Automatically rewriting Pinmind after every task. Preserve a reproducible miss, get RED, make the smallest rule change, then prove GREEN.
- A giant Russian/English synonym dictionary in `description`; it harms precision and competes for the host's discovery budget.
- Mandatory one-agent-per-task fan-out, a fixed eight-phase workflow, ticket server, polling loop, or auto-deploy stack.
- Always-on dashboard, daemon, MCP telemetry server, cloud trace store, full LangGraph/Temporal/OPA runtime, or model router in the core.
- A model call whose purpose is to choose another model, automatic Sol escalation for every high-risk task, or a retry loop without a declared oracle and hard attempt cap.
- Estimated token counts or “tokens saved.” Only authoritative post-turn usage is reportable as actual.
- A promise to intercept every possible Russian phrase. Host discovery remains semantic and probabilistic.

## Comparison with adjacent projects and runtimes

| Influence | Already adopted in `v0.2.1` | Remaining useful lesson | Boundary retained |
|---|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | RED/GREEN, systematic diagnosis, activation regressions, evidence before completion | baseline classification and mutation-aware final freshness | no mandatory hooks/worktree/agent fan-out for trivial work |
| [nick-vels/skills](https://github.com/nick-vels/skills) | immutable brief, frozen contract, blind goal acceptance, checkpoints/handoffs | exact authorization receipt for high-risk external effects | no fixed eight phases, dashboard server, or agent per ticket |
| [mattpocock/skills](https://github.com/mattpocock/skills) | small composable disciplines, public seams, short feedback loops | compare viable interface shapes before irreversible architectural choices | no monolithic workflow engine or compulsory parallel design for ordinary changes |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/interrupts) | none as a runtime dependency | stable thread/run identity, checkpointed resume, and idempotent boundaries because an interrupted node can execute again | no graph runtime, persistence backend, or implicit side-effect replay |
| [Temporal](https://docs.temporal.io/encyclopedia/retry-policies) | fail-closed local state and bounded lifecycle phases | explicit retry classification, attempt cap, and crash-consistent transition history | no service, worker fleet, database, or general workflow engine |
| [OpenAI Agents SDK HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/) | prose authority gate and persistent run state | bind one approval/rejection to one concrete pending action and resume the top-level run | no SDK runtime or cloud trace requirement; authority remains user-owned |
| [OpenAI Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/) | repository-local contracts and serialized controller state | reconcile tracker/filesystem state before new work and keep the control plane minimal | no daemon, ticket poller, per-issue workspace fleet, or rigid state machine for ordinary tasks |

Pinmind remains an independent synthesis. Its distinct guarantees are deterministic hashed contracts, amendments, traceability, an evidence gate, and proportional routing; the source projects retain different scopes and ecosystems. The comparison defines adopted invariants and retained boundaries rather than a cross-project quality ranking. The design test is: take the smallest mechanism that closes a reproduced failure, and reject its surrounding platform unless a second measured need justifies it.

## Source ledger

Primary/current sources reviewed on 2026-08-17:

- [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI Optimize Metadata](https://developers.openai.com/plugins/guides/optimize-metadata)
- [Codex SDK event types](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts)
- [Codex App Server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [OpenAI GPT-5.6 model selection and prompting guide](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Temporal retry policies](https://docs.temporal.io/encyclopedia/retry-policies)
- [Superpowers verification before completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md)
- [Superpowers worktree/baseline workflow](https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/SKILL.md)
- [Matt Pocock Design It Twice](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/DESIGN-IT-TWICE.md)
- [OpenAI Evals build guide](https://github.com/openai/evals/blob/main/docs/build-eval.md)
- [Temporal durable execution](https://docs.temporal.io/)
- [SkillsBench](https://github.com/benchflow-ai/skillsbench)
- [SkillRouter](https://github.com/zhengyanzhao1997/SkillRouter)
- [MetaTool](https://github.com/HowieHwong/MetaTool)
- [AgentAbstain](https://github.com/AntiQuality/agentabstain)
- [MASSIVE](https://github.com/alexa/massive)
- [CLINC OOS](https://github.com/clinc/oos-eval)
- [Semantic Router](https://github.com/aurelio-labs/semantic-router)

Repository adoption and fork signals were used only as discovery filters; point-in-time star counts are kept in [design-decisions.md](skills/pinmind/references/design-decisions.md), not treated as proof of correctness.
