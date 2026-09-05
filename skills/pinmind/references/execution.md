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

- `continue` while the same owner, workspace, seam, feedback loop, and user boundaries remain healthy;
- `compact` at a clean phase boundary when canonical artifacts hold the durable state and conversational context is the only excess;
- `handoff` when a new session, workspace, harness, or owner is required;
- `subagent` for an independent goal with concrete payoff; writers also need a non-overlapping write zone.

A handoff is a pointer, not a copied transcript. It is a bounded instruction from
the parent, not independent proof of identity or authority:

```text
goal; route + axes; canonical artifact paths + contract version;
verified facts/evidence IDs; unresolved blocker; next command;
suggested capabilities and write boundary
```

Never copy the full chat, frozen contract, long logs, rejected reasoning, or secrets into a handoff.

## Parallelism and context bundles

Parallelize writers only after dependencies and public contracts are stable. Writers require disjoint write zones, one owner for shared files, an explicit integration strategy, and acceptance of a parent interface before dependent work begins. Independent read-only work does not need a frozen contract or a write zone; it needs bounded inputs, a separate useful result, and a host worker.

### Native delegation admission

When native delegation is available and there are two or more useful,
independent directions, delegate them without waiting for another user reminder.
Use the smallest useful fan-out. A coupled writer may remain sequential while an
independent read-only check is delegated.

Admit a write worker only when all of the following are true:

1. Pieces do not wait for each other (`decomposition: independent`).
2. Write files do not overlap, or each writer has a worktree. Shared reads may overlap.
3. Each piece is specified without another piece's intermediate output.
4. Setup is cheaper than the piece itself.
5. The parent can merge and verify faster than children generate.

For read-only investigation, require independent questions, bounded inputs, and
an available host worker; overlapping reads are safe. If admission fails, record
the concrete exception: unavailable host capability, dependency, overlapping
write ownership, or work smaller than coordination. A large task by itself is
not an exception and must not become "spawn 7".

| Decision | When |
|---|---|
| `single-agent` | One bounded step, coupled state, unavailable host worker, or a recorded admission exception. |
| `sequential-units` | Large coupled write that still has to move; one owner, serial slices. |
| `read-only-fanout` | Independent reconnaissance, audit, or research. Shared reads are allowed. Cap 7. |
| `isolated-write-fanout` | Frozen contract, independent write DAG, worktree or disjoint zones, and an independent integration oracle. Cap 4. Parent owns shared files and the merge. |

Pinmind does not emulate or impersonate a host agent. Hosts with native
delegation use their supported primitive after this admission. A host without it
records that limitation and continues in a limited single-agent mode. One
integrated fresh-eyes review is useful after substantial integration; never use
a review fan-out per file.

The machine-checked contrasts live in `evals/fixtures/parallel-admission-v0.json`. AEP Phase 0 still does not start an agent and still owns only `workShape`, not host spawn.

Provide a worker only:

- unit goal and IDs;
- relevant contract excerpts;
- acceptance and invariant IDs;
- public seams and boundaries;
- current interfaces and relevant discoveries;
- commands and expected evidence;
- return format and owned write zone.

Exclude rejected brainstorming, full chat history, unrelated units, long logs, secrets, and whole-repository summaries.

The parent owns canonical `.pinmind` state. A worker must not create a root run,
call resume, update `active.json`, or coordinate other plugins. It returns its
bounded result and evidence; the parent decides whether current user authority
and requirements still permit integration. A cancellation, new task, or later
restriction invalidates a stale worker result until the parent checks it again.

## Discoveries

Accept only a verified reusable fact with source/evidence and scope. Deduplicate it, route it only to relevant later work, and keep transient run knowledge out of durable `AGENTS.md` unless it is stable and broadly useful.

## Circuit breaker

Stop the current repair strategy when the same failure class repeats, three repairs finish, scope expands materially, a new public boundary appears, context becomes unhealthy, reviewers repeat or contradict findings, failures move within one state surface, or the next action is a guess. Re-check current evidence, then search the web or a primary source when the repository cannot settle the blocker.

Classify the defect before continuing: contract, design, decomposition, environment, evidence, or implementation. Change the corresponding layer. For a second race or ordering symptom, model read/write/validation/reload/stale-response/cancel interleavings and ownership before any further patch.
