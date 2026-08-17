# Pinmind roadmap

Research and prioritization date: 2026-08-17. This roadmap was started after the verified `v0.2.1` release and expanded for `v0.2.2` with multilingual skill/tool-selection research. It records candidate work; it does not authorize implementation or turn Pinmind into a workflow service.

## Released baseline

Pinmind `v0.2.1` already has the mechanisms that were the main reason to study Superpowers, nick-vels/skills, and Matt Pocock's skills:

- deterministic post-activation RU/EN routing and proportional capability composition;
- RED/GREEN diagnosis, immutable briefs and contracts, amendments, traceable evidence, and blind goal-axis review;
- activation and routing corpora, a regression inbox, compact handoffs, and fresh-host smoke instructions;
- serialized canonical writes, physical path containment, bounded evidence commands, privacy-safe release staging, and actual-only token receipts;
- generated JSON/Markdown reports without a mandatory daemon, dashboard, MCP server, or external telemetry store.

`v0.2.2` adds a source-backed [language-routing design](LANGUAGE_ROUTING.md) and README hero, not a new classifier or runtime. The current architecture and the reviewed 100-star-or-more projects and forks are recorded in [design-decisions.md](skills/pinmind/references/design-decisions.md). Roadmap items below deliberately exclude capabilities already present in the published baseline.

## Priority decision

The recommended next assurance initiative is **the phrase-level language-routing eval package**. It directly addresses the owner's current goal—better Russian, mixed-language, colloquial, typo, negative, and conflict handling—without pretending that internal router code can control the host's earlier skill choice.

The recommended next runtime initiative remains **a one-shot Codex post-turn receipt adapter**. It is still the smallest supported way to show exact token usage after a completed turn. Neither initiative needs a dashboard, daemon, vector database, or always-on service.

## Ranked initiatives

| Rank | Initiative | User value | Evidence | Complexity | Architectural fit | Adoption gate |
|---:|---|---|---|---|---|---|
| 1 | Phrase-level language-routing eval package | High | Strong, convergent benchmark practice | Low-medium | Excellent | Original dev/release contrast corpus, 100% deterministic release agreement, zero unsafe downgrade, and per-slice metrics |
| 2 | One-shot Codex post-turn receipt adapter | High | Strong, public terminal event | Low-medium | Excellent | Exact field equality in fixtures and 20 real completed turns; interrupted or malformed streams never produce an `actual` receipt |
| 3 | Baseline and final-evidence freshness gate | High | Strong, mature workflow practice | Medium | Excellent | Every software-change run records baseline status; finalization proves required evidence was captured after the last relevant mutation or fails closed |
| 4 | Hash-checked authorization receipts for external effects | High for deploy/publish/admin work | Strong, official HITL pattern | Medium | Strong | Start after at least 3 effectful runs in 30 days or 1 reproduced authority-scope incident; then require an exact action/target/scope match |
| 5 | Real-host activation ledger | Medium-high | Strong, official metadata/eval guidance | Low-medium | Excellent | Zero negative false activation, safe conflict handling, and at least 90% intended-positive implicit selection across two fresh runs per supported host |
| 6 | Crash-consistent transition journal and recovery | High for interrupted runs | Strong, durable-execution precedent | High | Strong if kept local | Fault injection at every multi-file transition yields deterministic recovery or explicit fail-closed state with no accepted lost update |
| 7 | Architectural option review | Medium, conditional | Strong design precedent | Low | Strong when narrowly triggered | Only for hard-to-reverse public/cross-cutting seams; compare at least two viable interfaces before freezing the contract |

The ordering is by current user value, available evidence, implementation risk, and fit with Pinmind's lightweight boundary. A lower rank is not a rejection; each item has a condition that must be met before work starts.

## 1. Phrase-level language-routing eval package — recommended next

Implement the accepted contract in [LANGUAGE_ROUTING.md](LANGUAGE_ROUTING.md): original full phrases rather than dictionary entries, minimal act/abstain pairs, RU/EN/mixed/colloquial/typo slices, explicit authority and `mustNotMutate`, and separate host-selection, post-activation-route, and end-task-utility measurements.

### Proposed seam

- Add versioned `dev` and held-out `release` phrase corpora without copying third-party prompts.
- Add a dependency-free evaluator for exact route axes, pair accuracy, unsafe downgrade, mutation prohibition, and slice metrics.
- Keep a smaller representative host-smoke subset; manual desktop observations remain distinct from deterministic router results.
- Use a no-skill, explicit/oracle Pinmind, and natural host-selection comparison when measuring end-task utility.
- Change metadata or router policy only after a reproducible RED case identifies the owning seam.

### Acceptance and stop conditions

1. Every release fixture is schema-valid, uniquely identified, absent from the development prompt-hash set, and backed by human-authored or sanitized-regression provenance.
2. Deterministic route/axes agreement is 100%, every conflict pair stays read-only, and no high-risk case is downgraded unsafely.
3. Results are reported separately by RU, EN, mixed language, colloquial, typo, negation/conflict, and high-risk slices.
4. Do not introduce embeddings or training until 100–200 sanitized real cases show a repeated held-out miss that the current router cannot fix safely.
5. Do not change the concise discovery description merely to make local fixtures green; fresh-host selection is a separate gate.

## 2. One-shot Codex post-turn receipt adapter — recommended runtime capability

### Proposed seam

- Accept a public `codex exec --json` stream or launch one explicit Codex turn as a foreground wrapper.
- Forward the normal assistant result; wait for exactly one successful terminal `turn.completed` event.
- Copy `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, and `reasoning_output_tokens` without reinterpretation. Derive Pinmind's total only by its documented input-plus-output rule.
- Optionally write the existing hash-checked `usage.json` for an explicit run and print the exact post-turn token line after the model response.
- Store no raw prompt or assistant body by default. Persist only sanitized event provenance and the usage fields.
- Keep `unavailable` for failed, interrupted, ambiguous, missing, or unsupported streams.

The Codex SDK defines token usage on `turn.completed`, which is normally emitted after the assistant response. That sequencing is why an instruction-only skill cannot place its own exact final total into the response before completion, but a foreground observer can show it immediately afterward. See the [Codex SDK event types](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts) (accessed 2026-08-17).

### Acceptance and stop conditions

1. Fixture coverage reproduces all five public usage fields exactly and rejects negative, inconsistent, duplicate-terminal, truncated, and failed streams.
2. Twenty successful real CLI turns produce receipts equal to their terminal event payloads; ten interrupted or malformed trials produce no false `actual` receipt.
3. The adapter is opt-in, foreground-only, dependency-light, and never parses private rollout files.
4. The ordinary ChatGPT/Codex skill path remains valid without it and still reports `unavailable` when the host exposes nothing authoritative.
5. Do not add a dashboard as part of this initiative.

## 3. Baseline and final-evidence freshness gate

Pinmind stores command provenance, but `final verify` intentionally does not replay commands and cannot currently prove that arbitrary workspace changes did not happen after evidence capture. The next integrity step is a conservative freshness snapshot, not a universal time-to-live.

### Proposed seam

- Before mutation in a `software-change` route, record `baseline: green | pre-existing-failure | unavailable` from the narrowest affordable project check.
- Preserve a pre-existing failure verbatim and never attribute it to the new change.
- Attach a Git revision/diff fingerprint, or a bounded declared-artifact fingerprint outside Git, to each completion-critical verification snapshot.
- Before completion, compare that snapshot with the current relevant state. A later relevant mutation marks the evidence stale until the planned check is captured again.
- When no trustworthy fingerprint is possible, state that freshness is manual or unavailable; do not silently pass.

This adopts the narrow useful part of Superpowers' baseline and verification discipline: success claims require current command evidence, not prior output. Sources: [using git worktrees](https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/SKILL.md) and [verification before completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) (accessed 2026-08-17). It does not mandate a worktree for every task.

### Acceptance and stop conditions

- Test green, pre-existing-red, unavailable, unrelated-dirty, relevant-post-check mutation, untracked artifact, and no-Git cases.
- Finalization fails closed only for required stale evidence; it must not erase or mislabel the original observation.
- Do not use an arbitrary age threshold. Fresh means “captured after the last relevant mutation in this run.”

## 4. Authorization receipts for external effects

Pinmind already requires explicit current authority for publishing, deploying, messaging, migration, deletion, and production/admin changes. The missing machine seam is a canonical record of what exact action and target were approved.

### Proposed seam

- For persistent medium/high-risk runs, record a hash-checked receipt containing the effect class, exact target/scope, sanitized user authority, decision, and timestamp.
- Match the receipt immediately before the governed action. Any changed action, target, or scope invalidates it and requires new authority.
- Treat rejection, ambiguity, or missing authority as a hard stop. Never infer approval from credentials, access, historical permission, or a broad “finish everything.”
- Keep the mechanism local and dependency-free; do not embed the Agents SDK.

The OpenAI Agents SDK HITL flow pauses sensitive calls, persists the pending decision in run state, and resumes only after approval or rejection. Pinmind can adopt that invariant without importing the runtime. Source: [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) (accessed 2026-08-17).

### Adoption gate

Begin implementation when either condition is recorded in the regression inbox:

1. at least three Pinmind runs in a rolling 30-day window reach an explicitly authorized deploy, push, migration, message/send, or delete effect; or
2. one reproduced incident shows that an approval's action, target, or scope was ambiguous or changed before execution.

Until one threshold is met, the existing prose gate remains mandatory and the new artifact would be premature overhead.

## 5. Real-host activation ledger

`v0.2.2` records the phrase-level corpus contract; the existing 28-case activation-smoke corpus remains the starting host sample. The next host step is to record fresh outcomes over time without confusing host selection with deterministic routing.

### Proposed seam

- Select a compact representative subset from the versioned `dev` and held-out `release` language corpora.
- Store only sanitized result records: plugin/host/version, corpus hash, fresh-session flag, intended eligibility, observed activation, route, timestamp, and notes.
- Change one metadata field at a time and compare precision/recall against the same held-out set.
- Treat a positive host miss as a discovery regression signal, not as proof that the post-activation router is wrong. No public event currently guarantees that an implicitly selected skill can be identified on every host.

OpenAI says implicit discovery begins with only the skill name and description and recommends concise, front-loaded scope and boundaries. Its metadata guide recommends direct, indirect, and negative golden prompts, precision/recall tracking, one change at a time, and prioritizing precision on negatives. Sources: [Build skills](https://learn.chatgpt.com/docs/build-skills) and [Optimize Metadata](https://developers.openai.com/plugins/guides/optimize-metadata) (accessed 2026-08-17).

### Release threshold

- Store the exact held-out corpus version and SHA-256 plus a supported-host manifest. The initial matrix is Codex CLI and ChatGPT Desktop; record the concrete host/app versions used, and do not silently count an untested surface as supported.
- Execute two complete passes of the same fixed corpus on each listed host. Compute positive-selection recall per host as selected intended-positive observations divided by all intended-positive observations across those two passes.
- Deterministic router: 100% of release cases and no high-risk unsafe downgrade.
- Host smoke: zero false activation in negative observations, every selected conflict observation stays audit/read-only with confirmation, and at least 90% positive-selection recall per host across the two complete passes.
- Explicit `@Pinmind`/`$pinmind` remains the reliable override; never advertise 100% capture of arbitrary Russian wording.

## 6. Crash-consistent local transitions

The current writer lock serializes cooperating writers and each canonical file is written atomically, but a crash between several files can still strand an operation. A later milestone can add a tiny local prepare/commit/reconcile journal for `init`, `freeze`, `amend`, evidence mutation, and finalization.

Borrow the durable-execution invariant—resume deterministically after interruption—from [Temporal](https://docs.temporal.io/) (accessed 2026-08-17), but do not import Temporal, a database, a worker service, or a workflow engine.

### Adoption gate

- Add deterministic fault injection at every write boundary.
- Across at least 100 seeded interruption trials per multi-file transition, restart must either reconcile to one valid state or stop with one explicit recoverable error.
- Zero split-brain active runs, lost accepted evidence, or silently half-finalized runs.

## 7. Architectural option review

For `clarity: architectural` plus a hard-to-reverse public or cross-cutting seam, compare at least two viable interface shapes on locality, migration cost, testability, reversibility, and public surface before freezing the chosen contract. Record why the selected shape won.

This is a proportional adaptation of Matt Pocock's [Design It Twice](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/DESIGN-IT-TWICE.md) (accessed 2026-08-17). Multiple subagents are optional and justified only when independent designs buy real diversity; ordinary refactors stay inline.

## Deferred until evidence exists

### Static local dashboard

Do not build one now. Reconsider only after both conditions hold:

1. at least 50 authoritative post-turn receipts exist; and
2. at least three recurring decisions per month cannot be answered by the JSON/Markdown report.

If those gates are met, start with generated static read-only HTML over sanitized receipts. No raw prompts, write actions, daemon, public endpoint, or MCP server by default. A UI cannot manufacture token telemetry that the host never exposed.

### Policy-as-data and public JSON Schemas

Extract stable precedence/effect classes into versioned data only after a second real policy change makes the JS matcher difficult to review. Publish JSON Schemas only when a second consumer—CI, an independent viewer, or another skill—needs to validate artifacts. Avoid two hand-maintained sources of truth.

### Resume attestation and mutation testing

Add a kernel-backed resume checklist only after a reproduced compaction/handoff failure. Add mutation testing for route precedence, validation, locks, containment, and final gates after public behavior is stable enough that its runtime cost is justified.

## Explicitly rejected

- Automatically rewriting Pinmind after every task. Preserve a reproducible miss, get RED, make the smallest rule change, then prove GREEN.
- A giant Russian/English synonym dictionary in `description`; it harms precision and competes for the host's discovery budget.
- Mandatory one-agent-per-task fan-out, a fixed eight-phase workflow, ticket server, polling loop, or auto-deploy stack.
- Always-on dashboard, daemon, MCP telemetry server, cloud trace store, full LangGraph/Temporal/OPA runtime, or model router in the core.
- Estimated token counts or “tokens saved.” Only authoritative post-turn usage is reportable as actual.
- A promise to intercept every possible Russian phrase. Host discovery remains semantic and probabilistic.

## Comparison with the three design influences

| Influence | Already adopted in `v0.2.1` | Remaining useful lesson | Boundary retained |
|---|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | RED/GREEN, systematic diagnosis, activation regressions, evidence before completion | baseline classification and mutation-aware final freshness | no mandatory hooks/worktree/agent fan-out for trivial work |
| [nick-vels/skills](https://github.com/nick-vels/skills) | immutable brief, frozen contract, blind goal acceptance, checkpoints/handoffs | exact authorization receipt for high-risk external effects | no fixed eight phases, dashboard server, or agent per ticket |
| [mattpocock/skills](https://github.com/mattpocock/skills) | small composable disciplines, public seams, short feedback loops | compare viable interface shapes before irreversible architectural choices | no monolithic workflow engine or compulsory parallel design for ordinary changes |

Pinmind remains an independent synthesis. Its distinct guarantees are deterministic hashed contracts, amendments, traceability, an evidence gate, and proportional routing; the source projects retain different scopes and ecosystems. The comparison defines adopted mechanisms and retained boundaries rather than a cross-project quality ranking.

## Source ledger

Primary/current sources reviewed on 2026-08-17:

- [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI Optimize Metadata](https://developers.openai.com/plugins/guides/optimize-metadata)
- [Codex SDK event types](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts)
- [Codex App Server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/)
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
