# Changelog

All notable changes to Pinmind are recorded here as a curated release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Target patch: not assigned.

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
