# Work loop

Use this after the kernel route is recorded. Keep ceremony proportional.
Simple and operational work stays inline and creates no Pinmind artifacts.

## Defining loop

1. **Design before implementation.** For a software behavior change, name the
   outcome and 2–3 approaches (or a two-sentence bounded design) before writing
   production code. A spike answers a question; it does not keep prototype code.
2. **Failing public-seam check first.** Before a production behavior change,
   observe a valid failure at a public seam (test, CLI, API, or browser). If
   you did not watch it fail, you do not know it tests the right thing.
3. **Root-cause evidence before a fix.** For bugs and unexpected behavior,
   reproduce and isolate the cause. Do not patch symptoms.
4. **Fresh verification before "done".** Re-run the command that proves the
   claim in this turn. Previous runs, confidence, and "should pass" are not
   evidence.

Authority gates still apply: do not deploy, push to a shared branch, delete,
migrate production, or rotate credentials without the user's exact authority.

## Self-repair

Stop repeating the same strategy after two failures of the same class, three
repair rounds, a guess, or evidence that cannot distinguish success from
failure. Re-check the current artifacts and the original request. Search the web or primary sources when the repo, docs, or local evidence are not enough.
Then change strategy or report the blocker.

## Do not copy

Do not require a visual companion, a git worktree, or 2–5 minute plan
microsteps. Do not estimate token usage. If the host did not expose
authoritative counts, omit the token line.
