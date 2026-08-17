# Design decisions: activation, routing, usage, and UI

Research snapshot: 2026-08-16. GitHub star counts are point-in-time discovery signals, not quality scores, and will drift.

## Host constraints

- OpenAI [Build skills](https://learn.chatgpt.com/docs/build-skills) says discovery initially exposes the skill name and description; implicit selection depends on matching that description. It recommends concise scope, boundaries, and front-loaded trigger terms. It does not promise deterministic recognition of every language or phrasing.
- Codex [App Server](https://learn.chatgpt.com/docs/app-server) and the Codex SDK [`turn.completed` event](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts) expose usage after model work completes. The instruction-only skill does not receive a documented, exact whole-task counter before composing its own final response.
- OpenAI [hooks](https://learn.chatgpt.com/docs/hooks) do not expose a stable whole-task token counter to a Stop hook.
- A custom ChatGPT [plugin UI](https://developers.openai.com/plugins/build/chatgpt-ui) is an MCP resource rendered in an iframe. Adding it would introduce a server, lifecycle, CSP, privacy, and security boundary; see [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy).

Consequences:

1. Improve implicit activation at the discovery description, then route semantically after activation.
2. Treat arbitrary-language capture as a measured eval target, not a 100 percent guarantee.
3. Report actual usage only from a post-completion host/API source; otherwise say unavailable.
4. Keep UI optional. A local read-only JSON/Markdown report answers the current question without a daemon or MCP server.

## Project evidence

| Source | Stars at snapshot | Adopted | Not copied |
|---|---:|---|---|
| [obra/superpowers](https://api.github.com/repos/obra/superpowers) | 272,727 | RED/GREEN skill evals, systematic diagnosis, evidence before completion, concise discovery metadata | mandatory hook/bootstrap stack and workflow cost for every tiny task |
| [pcvelz/superpowers](https://api.github.com/repos/pcvelz/superpowers) | 1,230 | task-relative complexity tiers and observable routing | Claude-specific hooks and mandatory per-microtask agents |
| [lucianghinda/superpowers-ruby](https://api.github.com/repos/lucianghinda/superpowers-ruby) | 363 | narrow domain specialization composed over a controller | framework-specific policy in Pinmind core |
| [REPOZY/superpowers-optimized](https://api.github.com/repos/REPOZY/superpowers-optimized) | 133 | bounded state/handoff ideas | unverified percentage-efficiency claims and English-regex activation hooks |
| [nick-vels/skills](https://api.github.com/repos/nick-vels/skills) | 197 | immutable brief provenance and blind goal-axis acceptance | fixed eight-phase Autopilot, polling server, ticket/agent per step |
| [mattpocock/skills](https://api.github.com/repos/mattpocock/skills) | 219,084 | small composable skills, public seams, fast feedback loops, separate spec/quality review | a monolithic workflow engine or telemetry runtime |
| [Karasukaigan/skills-zh](https://api.github.com/repos/Karasukaigan/skills-zh) | 235 | evidence that localized descriptions matter | translation without current upstream parity or routing evals |
| [Agent Skills specification](https://api.github.com/repos/agentskills/agentskills) | 24,300 | progressive disclosure through name and description | large always-loaded synonym dictionaries |

The visible forks of `nick-vels/skills` had no 100-star fork at the snapshot. That absence is recorded rather than filled with a weaker popularity claim.

Additional 100-star-or-more references shaped the implementation boundary:

- [OpenAI Agents SDK](https://api.github.com/repos/openai/openai-agents-python), 28,668 stars: explicit input/output/cached/reasoning usage breakdowns;
- [LangGraph](https://api.github.com/repos/langchain-ai/langgraph), 39,798 stars: conditional routing as a small decision graph, adopted here without the runtime dependency;
- [Promptfoo](https://api.github.com/repos/promptfoo/promptfoo), 24,275 stars, and [DeepEval](https://api.github.com/repos/confident-ai/deepeval), 17,617 stars: regression corpora and deterministic assertions before model-graded evaluation;
- [Langfuse](https://api.github.com/repos/langfuse/langfuse), 33,189 stars: observed usage takes precedence over derived or missing values, adopted as a data rule without its server;
- [AgentOps](https://api.github.com/repos/AgentOps-AI/agentops), 5,778 stars: run/session lifecycle concepts, adopted as local state only;
- [AutoGen](https://api.github.com/repos/microsoft/autogen), 60,454 stars: use teams and termination budgets only when complexity pays for them.

## Resulting Pinmind design

```text
concise bilingual host description
  -> deterministic post-activation route
     (route + clarity + span + risk + signals + confidence)
  -> proportional skill composition and evidence lifecycle
  -> final token line
  -> optional hash-checked local receipt and read-only report
```

The router uses named observable signals as guardrails, not as authority. A no-change qualifier overrides mutation and conflicting instructions require confirmation. Unknown wording defaults toward substantive handling rather than silently becoming `simple`.

The first reporting interface is `final.md` plus `report --format json|md`. A dashboard should be reconsidered only when trustworthy post-turn receipts have accumulated and a concrete recurring decision cannot be answered by the report. If added, it should be an opt-in, generated, read-only view with no raw prompts, secrets, daemon-by-default, or external telemetry dependency.

## Improvement without drift

Do not rewrite Pinmind automatically after every isolated task. When a real activation miss, routing error, unsafe downgrade, or reporting defect is observed, preserve the phrasing as a regression case first. Change metadata or policy only when the case is reproducible, then rerun the RU/EN corpus and the kernel suite. This keeps continuous improvement evidence-led instead of allowing one-off prompt drift.
