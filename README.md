# Pinmind

![Pinmind routes non-trivial work through specialized skills and verified evidence](docs/assets/pinmind-hero.png)

Pinmind is a Russian-and-English workflow controller packaged as a Grok skill and a Codex App plugin. It classifies non-trivial work, including colloquial and lightly misspelled Russian, applies a process proportional to risk, composes specialist skills, and requires current evidence before calling a task complete.

Current stable version: `0.8.0`.

- GitHub repository marketplace: included in this repository.
- Universal Plugins Directory: **not listed yet**. ChatGPT catalog steps apply only after OpenAI approval and a live listing check.

## Install, configure, and run

### Codex CLI: install the plugin from GitHub

1. Add the pinned stable repository marketplace:

   ```bash
   codex plugin marketplace add iammedved/Pinmind --ref v0.8.0
   ```

2. Start Codex, run `/plugins`, select **Pinmind Project**, and install **Pinmind**.
3. Start a new Codex session.
4. Run `/skills` and confirm that `pinmind` is available.

The repository marketplace is separate from OpenAI's universal Plugins Directory. Pinning `v0.8.0` selects this exact stable release; omit `--ref` only when you intentionally want the latest repository state.

### Codex CLI: upgrade or reinstall a reviewed revision

Replace `<reviewed-tag-or-commit>` with an immutable release tag or commit that
you have reviewed, then refresh only the Pinmind marketplace and plugin:

```bash
codex plugin remove pinmind@pinmind-project
codex plugin marketplace remove pinmind-project
codex plugin marketplace add iammedved/Pinmind --ref <reviewed-tag-or-commit>
codex plugin add pinmind@pinmind-project
```

Start a new Codex session and use `/skills` to confirm that `pinmind` is
available. The repository-local installer helper is retained only as a legacy
recovery path; it is not the supported public upgrade path.

### Codex CLI: install only the skill from source

1. Copy `https://github.com/iammedved/Pinmind`.
2. Start Codex CLI and invoke `$skill-installer`.
3. Ask: `Install the Pinmind skill from https://github.com/iammedved/Pinmind, path skills/pinmind.`
4. If Pinmind does not appear immediately, restart Codex.
5. Run `/skills` and confirm that `pinmind` is available.

No extra setup is required. Pinmind is currently skills-only: it needs no connector, external account, API key, or MCP server.

### Grok Build CLI: install for every new chat

Copy the skill into the user-scope Grok directory, or install the repository as a trusted plugin:

```bash
mkdir -p ~/.grok/skills
cp -a skills/pinmind ~/.grok/skills/pinmind
# or, from this repository:
grok plugin install . --trust
```

Start a new Grok session. Pinmind should appear in `/skills`. The host still chooses implicit activation; `$pinmind` or `@Pinmind` is the reliable trigger for critical work.

Start a new Codex session and send:

```text
$pinmind Audit this repository without changing files. Determine the route first and report only verified findings.
```

The first substantive status line should begin with:

```text
Route: audit |
```

### ChatGPT: install after public listing

Pinmind is not currently available in the public Plugins Directory. After the listing is approved and verified:

1. Open **Plugins** in ChatGPT.
2. Search for **Pinmind** and open its details.
3. Select the plus button to install it.
4. Start a new chat.
5. Send: `@Pinmind Audit this repository without changing files. Determine the route first and report only verified findings.`

No connector, external account, API key, or additional configuration is required for the current skills-only package.

Official OpenAI guidance: [install and use plugins](https://learn.chatgpt.com/docs/plugins), [package plugins and repository marketplaces](https://developers.openai.com/plugins/build/plugins), and [build or install skills](https://learn.chatgpt.com/docs/build-skills).

## What Pinmind does

1. After Pinmind is installed in a supported host, ChatGPT or Codex selects it implicitly, or you invoke it with `@Pinmind` or `$pinmind`.
2. The bundled kernel chooses `simple`, `operational`, `spike`, `audit`, `investigation`, or `software-change`.
3. Pinmind applies only the workflow needed for that route and keeps authority boundaries explicit.
4. Substantive changes use a frozen outcome contract and traceable evidence.
5. Final reporting separates passed, failed, uncertain, pending, and manual results.

Implicit selection is probabilistic. Explicit invocation is the reliable choice for critical work.

## Experimental Adaptive Execution Policy

`0.3.0-experimental` introduced AEP Phase 0: a provider-neutral decision contract, 16 original synthetic contrast cases, a held-out release split, and a deterministic validator.

`0.4.0-experimental` added the P0/P1 routing, recovery, baseline, freshness, and final-check guarantees. `0.4.1-experimental` corrected a fresh-CLI read-only regression. `0.4.2-experimental` distinguishes planning from execution, recognizes bounded Russian no-change gerunds, rejects unknown or repeated CLI flags, and reduces roadmap duplication. The adapter-first [P2 architecture decision](docs/p2-architecture.md) remains design-only; P2 host adapters are gated and off by default.

`0.5.0-experimental` adds a closed-schema, dependency-free language evaluator with 32 development and 32 frozen release-gate cases. It reports route, authority, mutation boundary, pair, risk, and language-slice results without changing runtime routing. The fixed corpus is regression evidence, not a statistically independent benchmark or a claim of universal language understanding or host activation.

`0.6.0` is the first stable public release line. It carries forward the reviewed
experimental baseline, fixes the P0 routing contrasts, adds the required GitHub
CI and frozen-input gate, exposes remaining boundaries in generated reports, and
publishes Codex logo metadata that points to the same tracked image as this
README. Stable refers to the release contract and versioning discipline; it does
not claim universal implicit activation, ChatGPT directory availability, an
independently administered corpus, or authoritative token measurement.

Phase 0 does **not** select a concrete model, change `route`, start an agent, authorize an action, or store prompts and traces. It only defines how a future host adapter could choose a work shape, capability profile, escalation reason, and verification oracle. Mapping profiles to current models and reasoning levels remains a later opt-in step that requires held-out evaluation and separate authorization.

## Kernel CLI

Run kernel commands from the target workspace with the repository-relative entry point:

```bash
node skills/pinmind/scripts/pinmind.mjs route --file request.json
printf '%s' '{"text":"Audit this repository and report only."}' | node skills/pinmind/scripts/pinmind.mjs route --file -
node skills/pinmind/scripts/pinmind.mjs init --run <run-id> --brief brief.md
node skills/pinmind/scripts/pinmind.mjs state reconcile --dry-run
node skills/pinmind/scripts/pinmind.mjs state recover --apply --expected-sha256 <transition-sha256> [--expected-lock-sha256 <dead-local-lock-sha256>]
node skills/pinmind/scripts/pinmind.mjs baseline capture --run <run-id> --file baseline.json -- <command> [args...]
node skills/pinmind/scripts/pinmind.mjs contract freeze --run <run-id> --file contract.json
node skills/pinmind/scripts/pinmind.mjs evidence capture --run <run-id> --file evidence.json -- <command> [args...]
node skills/pinmind/scripts/pinmind.mjs final check --run <run-id>
node skills/pinmind/scripts/pinmind.mjs finalize --run <run-id>
node skills/pinmind/scripts/pinmind.mjs report --run <run-id> --format md
```

`route --file -` reads the same JSON object from standard input and is the
write-free bootstrap for a read-only host. Stdin must finish within 5 seconds
and is limited to 1 MiB. Keep `--text` for short,
non-sensitive manual checks because its value is visible in process arguments.
Do not combine `--file` with `--text` or `--kind`; put an optional `kind` in the
JSON object instead.

New runs require an explicit baseline receipt before contract freeze. `final check` is the pure read-only gate; `finalize` is the preferred explicit completion command. The legacy `final verify` spelling remains a deprecated finalizing alias so existing automation does not silently change behavior.

See [kernel-cli.md](skills/pinmind/references/kernel-cli.md) for schemas and safety behavior.

## Project documentation

- [CHANGELOG.md](CHANGELOG.md) — stable and experimental release history.
- [ADAPTIVE_EXECUTION_POLICY.md](ADAPTIVE_EXECUTION_POLICY.md) — provider-neutral AEP Phase 0 contract and rollout boundary.
- [P2 architecture decision](docs/p2-architecture.md) — adapter boundaries, model handoffs, admission tests, and rejected runtime expansion.
- [ROADMAP.md](ROADMAP.md) — evidence-backed future priorities.
- [LANGUAGE_ROUTING.md](LANGUAGE_ROUTING.md) — implemented multilingual routing evaluator and remaining host-evaluation boundary.
- [SKILL.md](skills/pinmind/SKILL.md) — controller instructions and discovery rules.
- [Safety reference](skills/pinmind/references/safety.md) — secrets, workspace, and side-effect boundaries.
- [SECURITY.md](SECURITY.md) — private vulnerability reporting.
- [PRIVACY.md](PRIVACY.md) — data-handling scope.
- [SUPPORT.md](SUPPORT.md) — safe support requests.
- [CONTRIBUTING.md](.github/CONTRIBUTING.md) — manually reviewed proposals.

Runtime state is written to the target workspace's ignored `.pinmind/` directory. It must not be committed or packaged. Pinmind rejects symlinks in this state path and sanitizes credential-shaped text before persistence.

## Versioning

Pinmind follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):

- `MAJOR` for incompatible public-contract changes.
- `MINOR` for backward-compatible capabilities.
- `PATCH` for backward-compatible fixes and documentation corrections.

Release tags and plugin manifests use the same `MAJOR.MINOR.PATCH` version.
Changed packages always receive a new patch or minor version; Pinmind does not
publish or display Codex cachebuster build metadata.

The stable public line starts at `0.6.0`. Backward-compatible fixes use patch
versions such as `0.6.1`, `0.6.2`, and `0.6.3`; backward-compatible feature releases use a
new minor such as `0.7.0` or `0.8.0`. Existing experimental tags are immutable history and
are never moved to newer commits.

## Validation

The supported local release gate uses the exact Node version in
[`.node-version`](.node-version), validates the frozen-input manifest, and then
runs the same fixed command list as CI:

```bash
node scripts/verify-release.mjs --run
```

The manifest records SHA-256 digests for the router, language validator,
GitHub web-flow signing key, development corpus, held-out release corpus, and
mandatory unsafe-negative route regressions. The identity gate permits
provider-authored merge metadata only after local signature verification against
that frozen key. A digest change therefore requires an intentional manifest
update in review. Because the manifest and inputs remain in the same repository,
this is a review-visible tamper-evidence boundary, not a cryptographically
independent benchmark.

For an auditable inventory, Pinmind counts top-level `test(` declarations rather
than quoting Node's runtime summary. The current manifest records 83 declarations
across four test files, plus fixture-case counts for routes, activation, AEP, and
language evaluation. These are separate dimensions and are not presented as one
inflated "test count."

The expanded commands executed by the gate are:

```bash
node --test tests/kernel.test.mjs
node scripts/validate-aep-decision-contract.mjs
node --test tests/aep-decision-contract.test.mjs
node scripts/evaluate-language-routing.mjs
node --test tests/language-routing-evaluator.test.mjs
node --test tests/release-verification.test.mjs
node scripts/validate-plugin-skill.mjs
node --check skills/pinmind/scripts/lib/core.mjs
node --check skills/pinmind/scripts/pinmind.mjs
node scripts/check-release-identity.mjs
node scripts/check-repository-diff.mjs
```

The repository workflow runs this gate for pull requests and pushes to `main`
with read-only contents permission and immutable action revisions. A local pass
does not prove the GitHub-hosted check passed; that evidence exists only after the
workflow runs on GitHub.

## Limitations

- Pinmind cannot control whether a host selects it implicitly.
- The deterministic router runs only after Pinmind is selected.
- Passing the fixed language corpus does not prove arbitrary-language accuracy or host selection.
- AEP Phase 0 is an evaluation contract, not a runtime model or agent router.
- Filesystem locking is cooperative and single-host, not a distributed lock.
- Evidence containment protects workflow integrity; it is not a sandbox against a hostile writer.
- Pinmind includes no dashboard, daemon, connector, MCP server, or external telemetry service.

## License

[MIT](LICENSE)
