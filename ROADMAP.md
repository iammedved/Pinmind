# Pinmind roadmap

## Verified baseline

The released public baseline is `v0.5.0-experimental`; see the release record in
[CHANGELOG.md](CHANGELOG.md). It provides deterministic post-activation routing,
local run-state containment and recovery diagnostics, baseline/freshness evidence,
read-only `final check`, and explicit `finalize`. These are local guarantees:
they do not prove implicit host activation, resume a host process, replay external
effects, or select a model. `v0.5.0-experimental` also provides the closed-schema
64-case language evaluator and frozen release gate without changing runtime routing.

The canonical decisions are the [language-routing design](LANGUAGE_ROUTING.md),
[Adaptive Execution Policy](ADAPTIVE_EXECUTION_POLICY.md),
[P2 adapter-first ADR](docs/p2-architecture.md), and
[design notes](skills/pinmind/references/design-decisions.md). This roadmap records
only unfinished, measurable work; it is not implementation authority.

## Now

### 1. Close the verified router regressions

Keep read-only analysis distinct from implementation, classify PR creation and
merge/push actions by target and external effect, and never let explicit owner
authority lower protected-branch risk.

Gate: exact RED/GREEN contrasts cover analysis versus implementation, merge plan
versus execution, local versus remote effects, PR creation, unresolved targets,
and owner-bypass merge in RU/EN; the full kernel, AEP, and language suites remain
green.

Current local status: the contrast regressions and routing changes are implemented
and pass the local gate. They remain unreleased and are not activation evidence.

### 2. Add the first required CI gate

Add one minimal GitHub Actions workflow before another release. Pin a supported
Node LTS and run Node tests, AEP and language evaluators, plugin/skill validation,
syntax and diff checks, version/release coherence, and the frozen-manifest check.

Gate: pull requests and `main` report the same required green check from a clean
GitHub-hosted runner; local-only success is not release evidence.

Current local status: the minimal read-only workflow, exact Node pin, plugin/skill
validator, frozen-input digest check, and documented inventory methodology are
implemented. The gate remains incomplete until the workflow is published and a
clean GitHub-hosted run is observed.

### 3. Harden `main`

Require a pull request and the CI check, retain deletion and non-fast-forward
blocks, and keep owner bypass only as a documented emergency exception.

Gate: an ordinary direct update and an unchecked merge are rejected; the
emergency path is separately auditable and never treated as routine release flow.

## Next

### 4. Complete the existing 0.5.0 release record

Create a GitHub prerelease for the existing `v0.5.0-experimental` tag. Do not
create or move a tag.

### 5. Fresh-host activation evidence

Measure the host-selection seam separately from deterministic routing. Run two
fresh implicit and two fresh explicit `$pinmind` checks for each supported Codex
surface, preserving host version, package hash, selected skill, and the first
route before other task tools. Keep ChatGPT unconfirmed until distribution and
selection are directly observed.

### 6. Make release inputs independently governed

The local source now contains a reviewed release manifest with SHA-256 digests for
the router, language schema validator, development corpus, release corpus, and
mandatory unsafe-negative cases. CI fails when a digest changes without an
intentional manifest update. Because the manifest still lives beside the router
and expected answers, add separate review ownership or equivalent governance so
they cannot be routinely tuned and approved together.

### 7. Document supported upgrade and reinstall

Provide one public CLI/Codex App workflow that updates only the named marketplace,
reinstalls Pinmind, starts a fresh session, and verifies `/skills`. Retain the
personal installer as legacy until the public path is proven.

### 8. Measure before reducing the always-loaded layer

Collect authoritative host usage receipts first. Only then move lifecycle and
evidence procedures from `SKILL.md` into on-demand references, remove verified
duplication, and compare observed context cost. Offline regression corpora remain.

### 9. P2A activation observation ledger

Implement the opt-in adapter in the [P2 ADR](docs/p2-architecture.md) only after
the host corpus and its observation schema are stable. It records an observation;
it does not change routing or execution.

Gate: schema validation rejects unknown/private fields and duplicate IDs, and a
fresh-session implicit-selection claim requires its evidence.

### 10. P2B post-turn usage receipt

Implement a foreground-only Codex terminal-event adapter that copies authoritative
usage fields exactly, otherwise records `unavailable`.

Gate: fixture coverage rejects malformed, duplicate-terminal, failed, and truncated
streams; 20 successful real CLI turns match terminal events exactly; 10 interrupted
or malformed trials produce no false `actual` receipt.

## Conditional

### P2C authorization receipt plus effect guard

Start only when a concrete effect adapter can enforce a receipt immediately before
one governed action, and either three explicitly authorized external-effect runs in
30 days or one reproduced scope/target ambiguity is recorded. Gate: exact
action/target/scope match, durable result state, idempotency, and no automatic retry
after an ambiguous result.

### P2D shadow Luna/Terra/Sol dispatch

Start only after the host exposes a verified pre-turn model-selection hook. Keep it
counterfactual until held-out work shows zero safety, authority, or evidence
regression; no increase in unresolved failures; and a host-observed latency, token,
or cost benefit at comparable effort. Any failure returns the adapter to shadow.

### Optional semantic routing experiment

Consider an offline multilingual classifier only after 100–200 sanitized labelled
post-activation cases show a repeated held-out semantic miss that small deterministic
policy changes cannot fix safely. It must improve pair and slice results with zero
additional unsafe downgrades and abstain on weak support.

## Explicit non-goals

- No general RU/EN synonym dictionary, copied benchmark prompts, fine-tuning, or
  model classifier merely to raise local fixture counts.
- No daemon, dashboard, vector database, mandatory external account, telemetry
  service, workflow engine, or model call to choose another model.
- No claim that deterministic corpus success proves universal language understanding,
  implicit activation, end-task utility, installation activation, or production safety.
- No automatic replay of deploys, messages, migrations, deletions, credentials, or
  other external effects; a stronger model never grants authority.

## Release discipline

Published behavior belongs in [CHANGELOG.md](CHANGELOG.md); architectural detail
belongs in the linked ADR and design documents. Promote a roadmap item only when its
gate has current evidence, and report fixture validation, host observations, and
production-only claims separately.
