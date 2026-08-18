# Execution reference

## Contents

1. Vertical evidence loop
2. Investigation feedback loop
3. Work-unit payback
4. Phase boundaries and handoff
5. Parallelism and context bundles
6. Discoveries
7. Circuit breaker

## Vertical evidence loop

Select one observable behavior at a public seam. Create or activate evidence that fails for the expected reason. Implement the minimum change, observe green, then refactor while preserving green. Proceed to the next contract slice.

Plan an evidence matrix before implementation, but write executable tests vertically rather than generating the entire suite up front. Use non-test evidence where it is more truthful: browser journeys, reference comparison, accessibility checks, benchmarks, migration dry-runs, traces, or external-service proof.

Require TDD for business rules, parsers, state transitions, API behavior, data consistency, bug reproduction, permissions, concurrency, and calculations when executable feedback is available. Permit another verified loop for generated code, configuration, content, assets, throwaway spikes, visual work, and infrastructure dry-runs.

## Investigation feedback loop

Build the tightest loop that can actually turn red, in this order:

```text
failing public-seam test -> CLI/API/browser check -> redacted artifact replay
-> minimal throwaway harness -> property/fuzz check -> bisect or differential comparison
```

Prefer a loop that reproduces the real symptom, is deterministic or reports a measured reproduction rate, runs in seconds where feasible, and can be repeated unattended. Run at least one valid red observation before claiming a root cause or implementing a fix. If no loop can distinguish hypotheses, stop speculation and report the attempted seams plus the missing access, artifact, environment, or authority.

## Work-unit payback

Create a work unit only when it yields at least one concrete benefit:

- fresh context;
- independent acceptance;
- rollback boundary;
- safe parallelism;
- distinct ownership or specialist capability;
- partial acceptance independent from another unit.

Reject a unit when it touches the same files as its neighbor, has no observable result, costs more context than work, or exists only to write tests, run tests, review, or meet a target count.

Make each unit a vertical contract slice across data, logic, interface, and evidence as required. Store only IDs, dependencies, write zones, risk, and evidence obligations in `execution.json`; never turn it into a second source of truth.

## Phase boundaries and handoff

- `continue` while the same owner, workspace, seam, and feedback loop remain healthy;
- `compact` at a clean phase boundary when canonical artifacts hold the durable state and conversational context is the only excess;
- `handoff` when a new session, workspace, harness, or owner is required;
- `subagent` only for an independent goal with concrete payoff and a non-overlapping write zone.

A handoff is a pointer, not a copied transcript:

```text
goal; route + axes; canonical artifact paths + contract version;
verified facts/evidence IDs; unresolved blocker; next command;
suggested capabilities and write boundary
```

Never copy the full chat, frozen contract, long logs, rejected reasoning, or secrets into a handoff.

## Parallelism and context bundles

Parallelize only after dependencies and public contracts are stable. Require disjoint write zones, one owner for shared files, an explicit integration strategy, and acceptance of a parent interface before dependent work begins.

Provide a subagent only:

- unit goal and IDs;
- relevant contract excerpts;
- acceptance and invariant IDs;
- public seams and boundaries;
- current interfaces and relevant discoveries;
- commands and expected evidence;
- return format and owned write zone.

Exclude rejected brainstorming, full chat history, unrelated units, long logs, secrets, and whole-repository summaries.

## Discoveries

Accept only a verified reusable fact with source/evidence and scope. Deduplicate it, route it only to relevant later work, and keep transient run knowledge out of durable `AGENTS.md` unless it is stable and broadly useful.

## Circuit breaker

Stop the current repair strategy when the same failure class repeats, three repairs finish, scope expands materially, a new public boundary appears, context becomes unhealthy, reviewers repeat or contradict findings, failures move within one state surface, or the next action is a guess. Re-check current evidence, then search the web or a primary source when the repository cannot settle the blocker.

Classify the defect before continuing: contract, design, decomposition, environment, evidence, or implementation. Change the corresponding layer. For a second race or ordering symptom, model read/write/validation/reload/stale-response/cancel interleavings and ownership before any further patch.
