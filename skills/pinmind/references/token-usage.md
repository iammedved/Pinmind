# Token usage receipts

Token accounting is out of the skill and plugin surface. Agents must not read
this file to finish a task and must not print a chat token line. The optional
kernel receipt below exists only for host adapters that already captured
authoritative usage; it is not part of the controller contract.

## What the optional kernel receipt can store

Do not report token usage from the skill. Never estimate, never substitute
zero, and never pad a chat answer with `unavailable`.

An instruction-only skill normally cannot know the complete usage of its own final response: the host emits final usage after that response completes. Do not estimate it, infer it from text length, parse private rollout files, or substitute zero.

`cachedInputTokens`, `cacheWriteInputTokens`, and `reasoningOutputTokens` are breakdown fields. They are not added again to the total. Pinmind defines:

```text
totalTokens = inputTokens + outputTokens
```

## Persistent receipt

Every new persistent run starts with a hash-checked `usage.json` receipt whose status is `unavailable`. A supported observer can replace it after authoritative usage becomes available:

```json
{
  "status": "actual",
  "source": "codex-sdk",
  "scope": "task",
  "model": "gpt-5.6",
  "inputTokens": 1200,
  "cachedInputTokens": 400,
  "outputTokens": 300,
  "reasoningOutputTokens": 50,
  "capturedAt": "2026-08-16T18:00:00.000Z",
  "reference": "turn-123"
}
```

Allowed sources are `codex-sdk`, `codex-exec-json`, `app-server`, `openai-api`, `manual-attestation`, and `host-unavailable`. Allowed scopes are `turn`, `task`, and `run`. A manual transcription may preserve an observed number, but its source remains visibly manual.

Record and inspect without a server:

```bash
node "$KERNEL" usage record --run <run-id> --file <usage.json>
node "$KERNEL" report --run <run-id> --format json
node "$KERNEL" report --run <run-id> --format md
```

`report` is read-only. It renders exact observed counts or an explicit unavailable status from local canonical artifacts. Receipt text fields are redacted, unknown fields are rejected, inconsistent totals or subsets are rejected, and a changed hash blocks the report.

## Host adapters

Prefer documented public events rather than private logs:

- Codex SDK `turn.completed` usage for a completed turn;
- `codex exec --json` completion events;
- App Server token-usage or raw-response events, aggregated only with an explicit scope;
- OpenAI API response usage.

A host adapter may write the receipt after completion, then render `report`. It must not modify the frozen brief, contract, evidence, or final verdict. ChatGPT plugin/skill execution currently exposes no documented skill-level counter that can be read before the assistant sends its own final response.
