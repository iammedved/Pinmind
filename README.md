# Pinmind

![Pinmind routes non-trivial work through specialized skills and verified evidence](docs/assets/pinmind-hero.png)

Pinmind is a Russian-and-English workflow controller packaged as a Codex skill and a ChatGPT/Codex plugin candidate. It classifies non-trivial work, applies a process proportional to risk, composes specialist skills, and requires current evidence before calling a task complete.

Current source version: `0.2.3`.

- GitHub repository marketplace: included in this repository.
- Universal Plugins Directory: **not listed yet**. ChatGPT catalog steps apply only after OpenAI approval and a live listing check.

## Install, configure, and run

### Codex CLI: install the plugin from GitHub

1. Add the verified `0.2.3` repository marketplace:

   ```bash
   codex plugin marketplace add pinmind-project/Pinmind --ref v0.2.3
   ```

2. Start Codex, run `/plugins`, select **Pinmind Project**, and install **Pinmind**.
3. Start a new Codex session.
4. Run `/skills` and confirm that `pinmind` is available.

The repository marketplace is separate from OpenAI's universal Plugins Directory. Pinning `v0.2.3` installs the reviewed release; omit `--ref` only when you intentionally want the latest repository state.

### Codex CLI: install only the skill from source

1. Copy `https://github.com/pinmind-project/Pinmind`.
2. Start Codex CLI and invoke `$skill-installer`.
3. Ask: `Install the Pinmind skill from https://github.com/pinmind-project/Pinmind, path skills/pinmind.`
4. If Pinmind does not appear immediately, restart Codex.
5. Run `/skills` and confirm that `pinmind` is available.

No extra setup is required. Pinmind is currently skills-only: it needs no connector, external account, API key, or MCP server.

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

## Kernel CLI

Run kernel commands from the target workspace with the repository-relative entry point:

```bash
node skills/pinmind/scripts/pinmind.mjs route --file request.json
node skills/pinmind/scripts/pinmind.mjs init --run <run-id> --brief brief.md
node skills/pinmind/scripts/pinmind.mjs contract freeze --run <run-id> --file contract.json
node skills/pinmind/scripts/pinmind.mjs evidence capture --run <run-id> --file evidence.json -- <command> [args...]
node skills/pinmind/scripts/pinmind.mjs final verify --run <run-id>
node skills/pinmind/scripts/pinmind.mjs report --run <run-id> --format md
```

See [kernel-cli.md](skills/pinmind/references/kernel-cli.md) for schemas and safety behavior.

## Project documentation

- [CHANGELOG.md](CHANGELOG.md) — release history and the `0.2.3` candidate.
- [ROADMAP.md](ROADMAP.md) — evidence-backed future priorities.
- [LANGUAGE_ROUTING.md](LANGUAGE_ROUTING.md) — multilingual routing evaluation design.
- [SKILL.md](skills/pinmind/SKILL.md) — controller instructions and discovery rules.
- [Safety reference](skills/pinmind/references/safety.md) — secrets, workspace, and side-effect boundaries.
- [SECURITY.md](SECURITY.md) — private vulnerability reporting.
- [PRIVACY.md](PRIVACY.md) — data-handling scope.
- [SUPPORT.md](SUPPORT.md) — safe support requests.
- [CONTRIBUTING.md](.github/CONTRIBUTING.md) — manually reviewed proposals.

Runtime state is written to the target workspace's ignored `.pinmind/` directory. It must not be committed or packaged.

## Versioning

Pinmind follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):

- `MAJOR` for incompatible public-contract changes.
- `MINOR` for backward-compatible capabilities.
- `PATCH` for backward-compatible fixes and documentation corrections.

Release tags use `vMAJOR.MINOR.PATCH`. Build metadata such as `+codex.<cachebuster>` refreshes an installed snapshot without changing the product version.

## Validation

```bash
node --test tests/kernel.test.mjs
node --check skills/pinmind/scripts/lib/core.mjs
node --check skills/pinmind/scripts/pinmind.mjs
git diff --check
```

## Limitations

- Pinmind cannot control whether a host selects it implicitly.
- The deterministic router runs only after Pinmind is selected.
- Filesystem locking is cooperative and single-host, not a distributed lock.
- Evidence containment protects workflow integrity; it is not a sandbox against a hostile writer.
- Pinmind includes no dashboard, daemon, connector, MCP server, or external telemetry service.

## License

[MIT](LICENSE)
