# Privacy

Pinmind `0.11.0` is a local skill and prompt-routing hook. It provides local instructions, a bundled kernel, and offline AEP, language-routing, and A/B/C evaluation inputs; it has no account system, connector, MCP server, telemetry service, or project-operated network endpoint. The hook returns routing context only and does not persist the submitted prompt.

Pinmind processes only the task context and files made available by the active ChatGPT or Codex host. Data handling by that host and by any separately enabled tool is governed by the corresponding provider and user configuration.

The AEP Phase 0 fixtures are original synthetic structures. Language-routing fixtures are original human-authored contrasts or sanitized router regressions and reject private-path, email, private-key, and non-approved provenance forms. The A/B/C sample contains two public synthetic task prompts and no observations; complete observations must use the same sanitized task records and may include tokens only through authoritative host receipt identifiers. These inputs contain no raw private chat, credentials, responses, traces, or model telemetry; all evaluators are local and read-only.

Do not place secrets or unnecessary personal data in prompts, evidence, issues, or pull requests. Review proposed changes before allowing writes or publication.
