# Proportional method composition

Pinmind remains the controller. Methods are small techniques selected after routing; they do not install another workflow controller or replace Pinmind's contract, authority, evidence, or lifecycle.

| Need | Use | Do not impose |
|---|---|---|
| unexplained failure | reproduce, isolate variables, trace the cause, then repair | speculative patches before root-cause evidence |
| behavior, business logic, API, permissions, or calculation change | public-seam RED, smallest GREEN, cleanup under green tests | mandatory TDD for prose, metadata-only edits, or trivial mechanical work |
| material architecture choice | state constraints, compare 2–3 viable alternatives, choose and record tradeoffs | repeated approval gates after the user already authorized the architecture |
| completion claim | run the fresh relevant command and inspect its current result | relying on an earlier run or a planned command |
| high-risk integrated change | one fresh-eyes review after implementation | unconditional subagents or duplicate ceremonial reviews |

Use the smallest method that can falsify the current hypothesis. A method may strengthen evidence but cannot expand user authority. If a specialist skill is required, load only the applicable skill and keep Pinmind as the lifecycle owner.

For architecture, approval is required only when the remaining choice materially changes outcome, safety, authority, or a hard-to-reverse boundary. Existing authorization is not invalidated merely because alternatives were documented.
