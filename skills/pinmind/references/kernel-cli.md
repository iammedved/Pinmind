# Deterministic kernel CLI

Run every command from the target workspace. Set `KERNEL` in your reasoning to the absolute path of `scripts/pinmind.mjs`; do not rely on a global installation. Create candidate brief, contract, execution, and evidence input files in an exact temporary directory, then remove that temporary directory after canonical run artifacts are safely written. Do not leave input drafts beside application code.

```bash
node "$KERNEL" --help
```

The CLI prints JSON, except `report --format md`, which prints Markdown. A failed structural gate prints JSON to stderr and exits nonzero. `route` returns `{ route, clarity, executionSpan, risk, reason, signals, confidence, needsHumanConfirmation }`; `route` is always one of `simple`, `operational`, `spike`, `audit`, `investigation`, or `software-change`, `signals` is non-empty, and `confidence` is `high`, `medium`, or `low`. Treat output as a guardrail: the RU/EN router is intentionally heuristic, classification never grants mutation authority, and low confidence should trigger safe discovery or one material clarification rather than an unsafe downgrade. For multiword or punctuation-heavy requests, prefer `--file` so shell quoting cannot truncate the route input.

## Start and route

```bash
node "$KERNEL" route --file <sanitized-request.json>
node "$KERNEL" route --text "<request>" [--kind simple|operational|spike|audit|investigation|software-change]
node "$KERNEL" init --run <safe-run-id> --brief <brief-source.md>
node "$KERNEL" state show [--run <run-id>]
node "$KERNEL" state resume [--run <run-id>]
node "$KERNEL" state reconcile --dry-run
```

For an active non-simple Pinmind task, run `route` before route-dependent tools or writes when the kernel is available. Run `init` only for a persistent software-change run. It creates `.pinmind/active.json` and the versioned run layout. Preserve the supplied source request separately until redaction and capture are confirmed.

`state resume` succeeds only when `active.json` names the sole verified run whose state is `active`; a named run must match that canonical owner. It reports the saved phase but does not replay commands or external effects.

`state reconcile --dry-run` inventories the physical managed run directories and active pointer without changing either. It reports `clean-idle`, `canonical-active`, `orphan-active`, `split-brain`, `pointer-nonactive`, `pointer-missing-run`, `pointer-diverged`, `pointer-invalid`, or `run-corrupt`, plus the next safe inspection step. A consistent result exits zero; an inconsistent result preserves the structured diagnosis in the error details and exits nonzero. Every inconsistent class blocks initialization, resume, active-run mutation, capture, and finalization. The command never repairs state, removes a lock, chooses between conflicting runs, or restarts task work; explicit repair and crash-journal recovery remain future work.

Canonical mutations use a workspace-wide `.pinmind/writer.lock`. Contending live local writers wait briefly and then serialize. A dead or foreign-host lock fails immediately; a malformed lock gets a bounded retry so a contender cannot mistake the owner's short metadata-write window for corruption. Persistent ambiguity ends with `LOCK_STALE_NEEDS_RECOVERY`. Pinmind never reclaims a lock automatically because two reclaimers could otherwise remove a newer owner's lock. Inspect the recorded host, PID, owner, operation, current processes, and canonical run state before explicitly removing that exact file. The lock is a cooperative single-host local-filesystem guarantee, not a distributed network-filesystem lock or a crash-atomic multi-file journal. Never delete it merely because its timestamp looks old.

## Validate, freeze, and amend a contract

```bash
node "$KERNEL" contract validate --run <run-id> --file <candidate.json>
node "$KERNEL" contract freeze --run <run-id> --file <candidate.json>
node "$KERNEL" contract amend --run <run-id> --file <next-version.json> \
  --reason "<reason>" --affects AC-001,INV-001,PRES-001 \
  --authority "<sanitized user authority containing any new source quotes>"
```

Use positive integer versions. Use globally unique typed IDs such as `REQ-001`, `AC-001`, `INV-001`, `PRES-001`, `EV-001`, and `WU-001`. Every MUST obligation must trace to acceptance or invariants. Every acceptance, invariant, and preservation rule must plan evidence.

Freeze writes a canonical hash and rejects later silent edits. Amend computes the normative diff, requires `--affects` to match it exactly, records prior/new values plus authority, and invalidates evidence from the actual diff. Use special tokens `INTENT`, `ACTORS`, `BOUNDARIES`, `ASSUMPTIONS`, and `OUT-OF-SCOPE` for corresponding top-level changes. Record fresh evidence against the current version.

## Validate optional execution units

```bash
node "$KERNEL" execution validate --run <run-id> --file <execution.json>
```

Provide `units[]` with `unitId`, obligation or criterion references, optional `dependsOn`, and non-empty relative `zone` paths. The gate rejects unknown traces, dependency cycles, unsafe paths, and overlapping zones between units that could run in parallel.

Usage and execution replacements take an optimistic snapshot before entering the writer lock. If another writer changed the same singleton view first, the later commit fails with `STALE_USAGE` or `STALE_EXECUTION` instead of reporting success for a silently overwritten update. Append-only evidence reloads under the lock, while contract and final-state commits revalidate their current version or status there.

## Record and verify evidence

```bash
node "$KERNEL" evidence record --run <run-id> --file <evidence-record.json>
node "$KERNEL" evidence capture --run <run-id> --file <evidence-template.json> \
  [--cwd <relative-workspace-path>] [--timeout-ms 50..300000] -- <command> [args...]
node "$KERNEL" evidence validate --run <run-id>
node "$KERNEL" final verify --run <run-id>
```

An evidence record needs `evidenceId`, current `contractVersion`, non-empty `covers`, an allowed `type`, a non-empty `command` or `procedure`, an `observed` result, and one supported status: `pass`, `fail`, `uncertain`, `pending-review`, or `not-applicable`. Allowed types are `unit-test`, `integration-test`, `end-to-end-test`, `property-test`, `static-typecheck`, `lint-static-analysis`, `browser-journey`, `screenshot-reference-comparison`, `accessibility-check`, `benchmark`, `migration-dry-run`, `log-trace-observation`, `manual-pending-review`, and `external-service-proof`. A `pass` also needs an `artifact` or `reference`. Evidence covering a target marked `critical: true` needs `sensitivity.method` and `sensitivity.observed`.

Prefer `evidence capture` for executable checks. It resolves the working directory and artifacts physically inside the workspace, starts the supplied argv directly with `shell: false`, and records the real exit code, bounded redacted output, timestamp, timeout/termination result, and artifact hash before storing `captured-command` provenance. The default timeout is 30 seconds. On timeout it records `fail` and attempts termination. POSIX provenance covers only the original process group; deliberately detached descendants are explicitly not covered. Windows reports success only when `taskkill /T` reports success; a direct-child fallback remains unconfirmed tree cleanup. The command after `--` is never parsed as shell text. A hand-written record containing a command cannot close a MUST requirement.

For a genuinely non-command observation, use `evidence record` with a non-empty `procedure`, no `command`, and `provenance.kind` set to `manual-attestation`. This is explicitly manual and unreplayed and cannot by itself close a `critical: true` target. Use `pending-review`, not `pass`, when the observer or required environment is unavailable.

`final verify` requires every evidence ID planned by each required MUST trace, invariant, and preservation rule to have a trustworthy current passing record that covers that target; multiple planned IDs are cumulative gates, not alternatives. It verifies stored captured-command provenance and current physical artifact paths/hashes, then revalidates any saved execution graph. Finalization repeats that gate while holding the writer lock before it writes `final.md`, marks the run complete, and clears the active pointer. The report lists non-pass optional evidence and separates machine-captured evidence from manual/unreplayed attestations. It never replays stored commands, inspects the real diff, or invents a user journey; capture those checks when they run and report manual evidence honestly.

## Record token usage and render reports

Read [token-usage.md](token-usage.md) before connecting host telemetry.

```bash
node "$KERNEL" usage record --run <run-id> --file <usage-receipt.json>
node "$KERNEL" report --run <run-id> --format json
node "$KERNEL" report --run <run-id> --format md
```

New runs begin with `status: unavailable`. `usage record` accepts actual counts only with an allowed observed source and derives `totalTokens` as input plus output. Cached input, cache-write input, and reasoning output are subsets and are never double-counted. Invalid, negative, inconsistent, or secret-bearing data is rejected or redacted. A checksum mismatch blocks reporting of an accidentally changed or incompletely rewritten receipt; this unkeyed hash is not a security boundary against a writer who can recompute it.

`report` is read-only. It renders lifecycle, evidence counts, and exact observed token usage or an explicit unavailable status. A post-turn host adapter may record authoritative usage after `final verify`; the report then reflects it without rewriting the contract or evidence verdict.
