# Pinmind roadmap

## Verified baseline

The released public baseline is `v0.4.2-experimental`; see the release record in
[CHANGELOG.md](CHANGELOG.md). It provides deterministic post-activation routing,
local run-state containment and recovery diagnostics, baseline/freshness evidence,
read-only `final check`, and explicit `finalize`. These are local guarantees:
they do not prove implicit host activation, resume a host process, replay external
effects, or select a model. `v0.4.2-experimental` also distinguishes planning
from execution, rejects unsupported CLI flags, and removes duplicated roadmap history.

The canonical decisions are the [language-routing design](LANGUAGE_ROUTING.md),
[Adaptive Execution Policy](ADAPTIVE_EXECUTION_POLICY.md),
[P2 adapter-first ADR](docs/p2-architecture.md), and
[design notes](skills/pinmind/references/design-decisions.md). This roadmap records
only unfinished, measurable work; it is not implementation authority.

## Now

### 1. Route safety and language-evaluation foundation

Keep the existing deterministic regression corpus and 28 activation fixtures as
compatibility coverage. Implement the separate, full development/release language
evaluator described in [LANGUAGE_ROUTING.md](LANGUAGE_ROUTING.md).

Gate:

- versioned development and held-out release fixtures have unique IDs and no prompt-hash overlap;
- release agreement is 100%, every conflict pair is read-only, and no destructive,
  production, or credential-effect case is below `high` risk;
- output reports route axes, authority, `mustNotMutate`, pair results, and RU/EN/mixed,
  colloquial, typo, negation/conflict, and high-risk slices;
- the evaluator and corpus contain only human-authored or sanitized-regression prompts.

### 2. Fresh-host activation evidence

Measure the host-selection seam separately from deterministic routing. Use a fixed,
representative subset in fresh ChatGPT/Codex sessions and retain only sanitized,
closed-schema observations.

Gate:

- each supported host completes two fresh-session passes with host/plugin and corpus hashes;
- zero negative false activations and at least 90% intended-positive recall per host;
- unavailable host selection remains `uncertain`, never inferred from a plausible answer;
- one discovery-metadata field changes per comparison.

## Next

### 3. P2A activation observation ledger

Implement the opt-in adapter in the [P2 ADR](docs/p2-architecture.md) only after
the host corpus and its observation schema are stable. It records an observation;
it does not change routing or execution.

Gate: schema validation rejects unknown/private fields and duplicate IDs, and a
fresh-session implicit-selection claim requires its evidence.

### 4. P2B post-turn usage receipt

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
