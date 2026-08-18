# Pinmind roadmap

## Verified baseline

The released public baseline is `v0.6.0`; see [CHANGELOG.md](CHANGELOG.md). It
provides deterministic post-activation routing, local run-state containment and
recovery diagnostics, baseline/freshness evidence, read-only `final check`, and
explicit `finalize`. It also includes the reviewed P0 routing contrasts, required
CI, frozen-input gate, stable release metadata, a closed-schema 64-case language
evaluator, and first-class remaining-boundary reporting.

These are local and repository-hosted guarantees. They do not by themselves prove
implicit host activation, resume a host process, replay external effects, select a
model, publish to ChatGPT's universal directory, or independently govern the
release corpus.

The canonical decisions are the [language-routing design](LANGUAGE_ROUTING.md),
[Adaptive Execution Policy](ADAPTIVE_EXECUTION_POLICY.md),
[P2 adapter-first ADR](docs/p2-architecture.md), and
[design notes](skills/pinmind/references/design-decisions.md). This roadmap records
only unfinished, measurable work; it is not implementation authority.

## Delivered in 0.6.0

- P0 route contrasts distinguish analysis from implementation and PR/merge/push
  planning from external execution, including negation, shared/protected targets,
  exact authority, and non-Git false-positive controls.
- The read-only GitHub Actions `verify` gate pins Node and action revisions and
  runs kernel, AEP, language, plugin/skill, manifest, syntax, release-coherence,
  and diff checks.
- Protected `main` requires a pull request and `verify`, and blocks deletion and
  non-fast-forward updates. The required check is pinned to its observed Actions
  integration, and the active `main` ruleset has no bypass actor.
- The supported public upgrade path refreshes only the Pinmind repository
  marketplace, reinstalls the tagged plugin, and requires a fresh session.
- Stable releases use full SemVer: `0.6.0`, then compatible fixes such as `0.6.1`
  and `0.6.2`; historical experimental tags remain immutable.

## Now

The unreleased `0.6.1` source removes displayed build metadata and hardens the
router against conditional Git actions, quoted commands, read-only questions,
and scoped negation. It is not installed or released until the normal PR, CI,
immutable-tag, release, and tagged-reinstall sequence completes.

### 1. Fresh-host activation evidence

Measure the host-selection seam separately from deterministic routing. The
`0.6.0` release has local evidence from two fresh implicit and two fresh explicit
Codex CLI sessions; it does not prove `0.6.1`, Codex App UI rendering, or a public
activation ledger. After tagged `0.6.1` installation, repeat that matrix for the
CLI and directly observe the App card/composer in a new App session, preserving
host version, package hash, selected skill, and the first route before other task
tools. Keep current ChatGPT distribution and selection unconfirmed until they are
directly observed for the released version.

### 2. Make release inputs independently governed

The release manifest records SHA-256 digests for the router, language validator,
development corpus, release corpus, and mandatory unsafe-negative cases. CI fails
when a digest changes without an intentional manifest update. Because the manifest,
router, and expected answers remain in one repository, add a distinct reviewer or
an externally administered signed manifest so they cannot be routinely tuned and
approved together. A `CODEOWNERS` entry naming the same sole maintainer would not
create independence.

### 3. Measure before reducing the always-loaded layer

Collect authoritative host usage receipts first. Only then move lifecycle and
evidence procedures from `SKILL.md` into on-demand references, remove verified
duplication, and compare observed context cost. Offline regression corpora remain.

### 4. P2A activation observation ledger

Implement the opt-in adapter in the [P2 ADR](docs/p2-architecture.md) only after
the host corpus and its observation schema are stable. It records an observation;
it does not change routing or execution.

Gate: schema validation rejects unknown/private fields and duplicate IDs, and a
fresh-session implicit-selection claim requires its evidence.

### 5. P2B post-turn usage receipt

Implement a foreground-only Codex terminal-event adapter that copies authoritative
usage fields exactly, otherwise records `unavailable`.

Gate: fixture coverage rejects malformed, duplicate-terminal, failed, and truncated
streams; 20 successful real CLI turns match terminal events exactly; 10 interrupted
or malformed trials produce no false `actual` receipt.

### 6. Prevent new public identity leakage

Implemented for `0.6.1`: the release gate checks the configured identity locally
and the prospective commit range in CI, accepting project-safe GitHub noreply or
test-only invalid-domain identities and rejecting personal-provider metadata.
Existing public history remains immutable and is not claimed to have been erased.

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
