# Changelog

All notable changes to Pinmind are recorded here as a curated release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Target patch: `0.2.3`.

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
