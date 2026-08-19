# Verification reference

## Contents

1. Evidence records
2. Verification gates
3. Review scaling
4. Completion report

## Evidence records

Record evidence against one contract version. Include evidence ID, covered criterion or invariant IDs, allowed type, status, command or procedure, observed result, artifact or external reference, commit or workspace snapshot when available, and verification timestamp. Every evidence ID planned by a required target is a cumulative final gate, not an interchangeable suggestion. For a passing critical target, include the sensitivity method and its observed result.

Use machine-captured command evidence when a check is executable: preserve argv, working directory, exit code, bounded redacted output, timestamp, and artifact hashes. A declarative command string is not proof of execution and cannot close a MUST requirement. Use `manual-attestation` only for an observation that cannot be represented as a command; the final report must label it manual and unreplayed. Manual attestation may inform review but cannot by itself close a target marked `critical: true`.

For a RED/GREEN loop, preserve both observations. Require the RED to fail because the contracted behavior is absent or broken, not because the test or environment is invalid. Keep expected values independent from production logic.

Use only these verdicts:

- `pass`: current evidence directly supports the claim;
- `fail`: current evidence disproves it;
- `uncertain`: available evidence cannot decide;
- `pending-review`: an unavailable human, browser, environment, or external system must decide;
- `not-applicable`: the criterion does not apply, with a recorded reason.

## Verification gates

Run separately:

1. `brief -> contract`: check missing, narrowed, invented, contradictory, and untestable intent before freeze.
2. `contract -> evidence/repository/running product`: check every MUST, invariant, preservation rule, boundary, and evidence sensitivity against the implementation and observed behavior.
3. `running product -> brief`: execute the primary journey as a blind goal-axis acceptance check. Give a fresh reviewer the immutable brief, the current outcome, and only the instructions needed to run it. Withhold the contract, plans, tickets, intended answer, and implementation summary so they cannot hide intent lost during paraphrase. Compare the result with the contract axis only after the blind verdict exists.
4. `whole change -> quality`: inspect the integrated diff for duplication, inconsistent values, dead code, interface drift, documentation gaps, security, maintainability, and missing tests.

Do not allow unit tests alone to stand in for the real product journey. Do not allow a successful journey to hide missing contract obligations.

Choose the real-journey equivalent that matches the deliverable: browser interaction for UI, direct API request for a service, CLI invocation for a command, representative library call for a package, migration dry-run for data work, rendered inspection for an artifact, or an explicit manual/external review. When the required environment is unavailable, use `pending-review`; never fabricate a pass.

## Review scaling

For low risk, use implementer self-review, targeted checks, diff sanity, and final verification. For medium risk, use one combined reviewer covering contract, scope, quality, and evidence sensitivity after the blind goal-axis verdict is fixed. For high risk, separate contract/evidence review from quality/security/reliability review. For every non-trivial integrated change, use a fresh-eyes whole-change review.

Run exactly one integrated fresh-eyes pass by default, not one pass per work unit, file, or criterion. Keep its brief-only goal-axis input isolated from the later contract and quality axes. If the harness cannot supply an independent context, apply the same checks inline and state that the goal-axis review was not blind or independent.

Have reviewers identify violated conditions and evidence, not silently edit implementation. Return a local correction to the same implementer once; use a fresh fixer when strategy changes, context is unhealthy, or the prior approach is exhausted. Apply the circuit breaker instead of extending repair loops indefinitely.

## Completion report

Generate `final.md` or the final response from current canonical state. Separate:

- completed and proven;
- failed;
- uncertain or pending;
- assumptions;
- amendments;
- useful additions outside MUST scope;
- manual steps and external gates;
- exact checks run and their current result.

Do not report token usage in the chat completion. Token accounting is out of the skill surface and must not appear in the user-facing report.

Never claim success from stale evidence, historical output, memory, an unexecuted command, or an unavailable capability. State partial completion plainly.
