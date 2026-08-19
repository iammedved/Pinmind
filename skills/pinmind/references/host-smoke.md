# Fresh-host activation smoke

Use `evals/fixtures/activation-smoke.json` after changing discovery metadata or reinstalling Pinmind. The corpus states intended eligibility plus deterministic routing after activation; it does not claim that a host selected the skill.

## Local gate

Run the kernel suite to validate corpus schema, language/class coverage, metadata boundaries, and every post-activation route. This proves only local policy and router behavior.

## Fresh-session gate

After reinstalling the plugin:

1. Start a new ChatGPT chat or a new Codex CLI/App Server thread. Never reuse the development chat as activation evidence.
2. Send a corpus prompt unchanged and without `@Pinmind` or `$pinmind` for an implicit observation.
3. Record whether Pinmind was `implicit`, `explicit`, `not-selected`, or `uncertain` and, when visible, its first route line.
4. Run explicit `@Pinmind` in ChatGPT and `$pinmind` in Codex as separate override checks; do not mix them into the implicit rate.
5. Preserve no raw chat content beyond the sanitized corpus prompt.
6. For a selected non-simple case, allow a higher-priority required skill-use announcement, then record whether the kernel route appeared before the first substantive progress update and before task references, memory, or workspace tools. A correct eventual route does not hide an ordering regression.

Each observation must contain:

```json
{
  "caseId": "ru-positive-investigation",
  "host": "codex-cli",
  "hostVersion": "observed version",
  "pluginVersion": "0.8.1",
  "observedAt": "canonical UTC timestamp",
  "freshSession": true,
  "selection": "implicit",
  "observedRoute": "investigation",
  "routeBeforeTaskTools": true,
  "notes": "optional bounded note"
}
```

Never manufacture a selection event that the host does not expose. A reproducible positive miss is an activation regression; it does not prove the router is wrong. A negative false positive is an over-trigger regression. Do not claim universal Russian-language capture or a 100 percent host pass rate from a probabilistic selector.
