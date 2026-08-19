# Safety reference

## Secrets

Redact secret-like values before writing brief, contract, evidence, state, logs, or context bundles. Preserve variable names only. Never place archive passwords, API keys, credentials, tokens, private keys, or session cookies in commands, artifacts, reports, or durable memory.

Treat hashes as accidental-drift and integrity detectors, not an adversarial security boundary. An agent with write access can rewrite content and recompute hashes. Use repository review, permissions, protected history, and external evidence when the threat model includes a malicious writer.

Treat a secret pasted into chat as exposed and recommend rotation when appropriate. Do not rotate it without authority.

## Git and workspaces

Inspect dirty state before changing files. Preserve unrelated user work. Never run destructive cleanup, hard reset, broad deletion, or force push without explicit and exact authority. Record the baseline revision when Git is available.

Prefer an isolated worktree for high-risk or independently reviewable work. Do not bypass repository locks, fingerprint checks, ownership zones, or single-writer boundaries.

Pinmind canonical mutations use one local workspace writer lock. Dead, malformed, ambiguous, and foreign-host locks all fail closed and are never automatically reclaimed. Before explicit recovery, verify the exact recorded owner, host, PID, operation, current processes, and run state; never delete a lock merely because a timestamp looks old. This does not claim distributed-lock correctness on NFS, SMB, or another multi-host filesystem, crash-atomicity across several canonical files, or protection from a hostile actor concurrently replacing filesystem objects. Per-file writes are atomic and cooperating canonical writers are serialized.

## External side effects

Require a separate user gate before deployment, publication, payment, email or message sending, destructive deletion, production migration, shared-branch push, credential rotation, or any comparable external effect. The router marks those requests `effect:external-side-effect` without flipping `needsHumanConfirmation`. Resolve exact target and scope with read-only checks first.

Apply this gate before operational routing. Treat only the user's current explicit authorization for the concrete target and effect as authority; do not infer it from historical access or a general request to "finish everything."

Treat production and admin surfaces as audit-only unless the user explicitly authorizes the concrete change. Do not infer mutation authority from access.

## Capability honesty

Snapshot available subagents, continuation, model pinning, worktrees, browser, screenshots, background jobs, and telemetry. Use fallbacks rather than pretending unavailable capabilities ran. Mark UI evidence `pending-review` when a required browser is unavailable. Never claim a particular model or independent review when the harness cannot provide it.

## Optional interfaces

Keep dashboard, daemon, external database, issue tracker, multi-model router, auto-deploy, and always-on hook stacks out of the core until evidence proves a concrete need. Prefer the generated read-only report for lifecycle and evidence. If a dashboard is added later, serve only generated public state over loopback with authentication and origin validation; never expose the run directory or interpret user text as instructions.
