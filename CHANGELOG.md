# Changelog

All notable changes to Pinmind are recorded here as a curated release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.2] - 2026-08-18

### Fixed

- Keep the README stable-version label and default pinned marketplace command
  coherent with the plugin manifest version.
- Add a regression that rejects an old default release ref or an `unreleased`
  label in stable source metadata.

### Changed

- Advance the clean stable plugin version to `0.6.2` without Codex cachebuster
  build metadata; `v0.6.1` remains immutable.

## [0.6.1] - 2026-08-18

### Fixed

- Distinguish executable Git collaboration clauses from read-only explanations,
  quoted commands, safety questions, explicit non-execution instructions, and
  scoped negations.
- Preserve high-risk shared-branch effects for conditional push or merge
  instructions and mixed review/execute clauses.

### Changed

- Use the clean plugin manifest version `0.6.1` with no visible Codex
  cachebuster build metadata.
- Expand the deterministic route corpus from 183 to 227 cases, retaining every
  attempted adversarial case with its pre-fix result and disposition.
- Reject personal-provider author or committer metadata in the prospective
  release range; accept GitHub-authored two-parent merge metadata only when its
  commit signature verifies against the frozen GitHub web-flow key, while leaving
  existing published history immutable.

## [0.6.0] - 2026-08-18

`0.6.0` starts the stable public line. Existing experimental tags remain
immutable history; compatible fixes follow as `0.6.1`, `0.6.2`, and so on.

### Fixed

- Keep bounded analysis requests read-only when generic wording such as
  `Сделай анализ` does not also request implementation.
- Classify PR creation and merge/push execution separately from PR review and
  merge planning, including mixed plan/execution clauses and negated actions,
  with explicit local, remote-collaboration, shared-branch, and protected-branch
  effects while excluding non-Git uses of merge/push.

### Added

- Add a minimal read-only GitHub Actions gate for pull requests and `main`, pinned
  to Node `24.19.0` and immutable checkout/setup-node revisions.
- Add a closed release manifest with SHA-256 digests for the router, language
  validator, development and release corpora, and unsafe-negative route cases.
- Add dependency-free release, workflow, plugin, and skill validators plus an
  explicit inventory of 80 top-level test declarations and separate fixture-case
  counts.
- Add first-class remaining-boundary data to JSON reports and matching sections
  to Markdown and finalized reports.
- Add Codex `logo` and `composerIcon` metadata that resolves to the exact tracked
  README hero image.

### Security

- Treat shared or protected branch mutation and unresolved remote merge/push
  targets as high risk; explicit owner authority is recorded for the exact
  action and target but never reduces risk.
- Pin the protected-main `verify` requirement to the observed GitHub Actions
  integration while preserving pull-request, deletion, and force-push rules.

## [0.5.0-experimental] - 2026-08-18

### Added

- Added 32 development and 32 frozen release-gate language-routing cases with unique prompt hashes, 32 validated contrast pairs, closed provenance, and RU/EN/mixed plus risk and authority slices.
- Added a dependency-free evaluator that reports exact route axes, authority, confirmation, mutation boundaries, unsafe downgrades, pair agreement, and slice metrics.
- Added fail-closed negative coverage for malformed schemas, private paths, prohibited provenance, duplicate IDs/prompts, invalid pairs, authority inconsistencies, and unsafe expectations.
- Kept host eligibility out of the local evaluator because `routeTask` cannot observe host selection; that remains a separate fresh-host measurement.

### Fixed

- Treat bounded vague English change requests such as `Make it work.` as uncertain and confirmation-required instead of silently clear.

### Security

- Keep evaluation read-only and outside kernel state; no corpus result authorizes mutation, proves host activation, or starts a P2 adapter.

## [0.4.2-experimental] - 2026-08-18

### Fixed

- Distinguish read-only planning and critique from explicit plan-and-execute requests, including bounded Russian gerund constructions such as `не внося изменений`.
- Reject unknown and repeated kernel CLI flags instead of silently accepting misspelled safety or timeout options.

### Changed

- Reduced the roadmap from a mixed release history and duplicated architecture document to a concise future-facing gate index.
- Clarified that the existing deterministic route and activation fixtures are not the still-future held-out language evaluator.
- Removed two unused kernel write helpers and made public version-coherence tests derive their current base version from the manifest.

### Security

- Preserve the existing deterministic, dependency-free router and fail closed on unsupported CLI flags without changing recovery, evidence, or external-effect boundaries.

## [0.4.1-experimental] - 2026-08-17

### Fixed

- Treat English `without changing files` and compound `do not create or modify files` wording as a read-only authority boundary instead of an affirmative modification request.
- Preserve a real fresh-CLI regression plus an affirmative implementation/conflict control in the deterministic route corpus.

## [0.4.0-experimental] - 2026-08-17

### Added

- Added deterministic regressions for unsafe production/credential phrasing and read-only explanation or investigation intent.
- Added canonical-active reconciliation plus an integrity-checked local transition journal and explicit recovery protocol for bounded Pinmind state mutations.
- Added explicit baseline receipts, bounded relevant-file freshness, read-only `final check`, and explicit `finalize` while preserving `final verify` as a compatibility alias.
- Added the adapter-first P2 architecture decision for activation observations, post-turn usage, guarded authorization receipts, and shadow Luna/Terra/Sol recommendations.

### Changed

- Advanced the minor component because P0/P1 add backward-compatible public capabilities; retained `experimental` because real-host activation and P2 adapters are not production-proven.
- Kept P2 out of the kernel until each independently removable adapter passes its admission gate.

### Security

- Fail closed on orphan, split-brain, divergent-pointer, missing-run, invalid-pointer, and corrupt-run active-state inconsistencies.
- Never describe a saved phase as task recovery, replay external effects during local recovery, or treat a model recommendation as authority.

## [0.3.1-experimental] - 2026-08-17

### Changed

- Advanced the patch component while retaining the `experimental` marker: the release hardens security without changing the AEP Phase 0 maturity level or runtime routing contract.
- Updated public installation documentation for the pinned `v0.3.1-experimental` repository marketplace while preserving `v0.3.0-experimental` as an immutable baseline.

### Security

- Reject symlinks and non-regular entries across the persistent `.pinmind` state path before reading or writing run data.
- Redact conventional environment-style credential assignments before briefs, amendments, or captured output are persisted.

## [0.3.0-experimental] - 2026-08-17

### Added

- Added the provider-neutral Adaptive Execution Policy Phase 0 decision contract for separating work shape, desired capability profile, actual host capability, escalation reason, and verification oracle.
- Added 16 original reviewed-synthetic cases as eight minimal contrast pairs, split evenly between development and held-out release corpora.
- Added a dependency-free, read-only validator and mutation tests for schema closure, pair integrity, capability availability, oracle gates, bounded input, and private-data rejection.

### Changed

- Updated public installation and release documentation for the pinned `v0.3.0-experimental` repository marketplace.
- Kept runtime routing and execution unchanged: Phase 0 neither selects a concrete model nor starts an agent or authorizes an action.

### Security

- Prohibited raw prompts, responses, traces, credentials, personal paths, identity fields, and concrete model brands from the AEP corpus.
- Required unsupported capabilities and missing verification oracles to fail closed to an explicit fallback or human-confirmation gate.

## [0.2.4] - 2026-08-17

### Security

- Removed all command-argument values and unrecognized executable paths from durable evidence provenance, while preserving the original arguments only for the requested subprocess execution.
- Added a regression test proving that captured commands receive the original synthetic arguments across named, short, assigned, and positional forms while `evidence.json` retains only safe placeholders.

## [0.2.3] - 2026-08-17

### Changed

- Replaced maintainer-specific installation notes with concise Codex CLI and conditional ChatGPT Plugins Directory journeys.
- Added a repository marketplace, pinned Codex CLI installation, source-skill fallback, configuration, first-run, and observable success steps based on current official OpenAI documentation.
- Replaced personal publisher and copyright attribution with the project identity in the plugin manifest and license.
- Added neutral contribution, support, privacy, terms, and private vulnerability-reporting guidance.

### Security

- Removed personal workstation paths, local usernames, private marketplace details, and private-only release commands from public-facing documentation and manifest metadata.
- Prepared a new clean-root public repository path so the existing private repository and its historical surfaces remain private and unchanged.
- Required maintainer-only writes and merges, manual review of external proposals, conservative automation permissions, secret scanning, and push protection.
- Kept universal Plugins Directory submission outside this release until OpenAI identity, review, and live-listing requirements are complete.

## [0.2.2] - 2026-08-17

### Added

- Added a researched roadmap that ranks post-turn token receipts, evidence freshness, explicit authorization records, held-out host evals, crash recovery, and architectural option review by value, evidence, complexity, fit, and measurable adoption gates.
- Added an owner-supplied Pinmind hero image to the README.
- Added a source-backed language-routing design covering full-phrase RU/EN/mixed-language corpora, minimal contrast and abstention pairs, held-out evaluation, and separate host-selection, deterministic-route, and end-task-utility metrics.

### Changed

- Reprioritized the next assurance milestone around measured multilingual routing coverage while retaining the one-shot Codex post-turn receipt adapter as the next runtime capability.
- Kept discovery metadata and runtime routing unchanged until a reproducible host or router regression justifies a focused policy change.

## [0.2.1] - 2026-08-16

### Changed

- Reworked the README into an actionable guide for purpose, lifecycle, installation, invocation, CLI use, versioning, design influences, token reporting, and limitations.
- Front-loaded and aligned the bilingual discovery and install-surface descriptions across `SKILL.md`, `agents/openai.yaml`, and `plugin.json`.
- Established SemVer base versions, immutable annotated release tags, Codex cachebusters as build metadata, and GitHub release notes as the release record.

### Added

- Added this curated changelog and automated metadata/version consistency coverage.
- Added a guarded personal-release installer that stages only Git-tracked files, serializes source swaps, rolls back failed installs, and verifies the installed cache byte-for-byte.

### Security

- Prevented ignored `.pinmind` runtime records and `.git` repository metadata from entering local plugin release snapshots.

## [0.2.0] - 2026-08-16

### Added

- Added mandatory deterministic post-activation routing with structured route axes, signals, confidence, and authority confirmation.
- Added RU, EN, mixed-language, colloquial, negative, conflict, architectural, and high-risk routing and activation corpora.
- Added immutable briefs, frozen versioned contracts, amendments, traceability, cumulative evidence gates, and generated final reports.
- Added actual-only token usage receipts with explicit unavailable fallback.
- Added route-to-capability composition, an investigation feedback-loop ladder, compact handoffs, and a regression inbox.

### Changed

- Serialized canonical mutations through a cooperative workspace writer lock and rejected stale singleton updates.
- Switched command and artifact containment from lexical paths to physical `realpath` checks.
- Bounded evidence execution by timeout and output limits, with platform-specific process-tree termination and honest provenance.
- Made deterministic routing the required first lifecycle step after activation when the kernel is available.

### Security

- Rejected symlink/junction escapes from evidence working directories and trusted artifacts.
- Strengthened redaction and public report handling for common secret-shaped values.
- Made stale or ambiguous lock ownership fail closed instead of reclaiming automatically.
