# Adaptive Execution Policy — Decision Contract v0

Status: Phase 0 evaluation contract. This document and its fixtures do not change Pinmind runtime behavior, select a model, start an agent, or authorize an external action.

## Decision boundary

Pinmind keeps two separate decisions:

1. The existing deterministic `route` owns user intent, clarity, execution span, and risk.
2. Adaptive Execution Policy (AEP) consumes that route plus a bounded read-only probe and current host capabilities, then recommends an execution shape, a provider-neutral capability profile, an escalation reason, and a verification oracle.

```text
routeSnapshot + probeSignals + hostCapabilities
                         |
                         v
 AEP recommendation: workShape + desiredProfile
                     + escalationReason + verificationOracle
                     + decisionConfidence + confirmation gate
                         |
                         v
 host execution records actualProfile
 verification records outcome
```

`actualProfile` and `outcome` are observations. AEP must never predict them or place them in `expectedRecommendation`.

## Inputs

### `routeSnapshot`

The existing route result is copied without reinterpretation:

- `route`: `simple | operational | spike | audit | investigation | software-change`;
- `clarity`: `clear | uncertain | architectural`;
- `executionSpan`: `local | cross-cutting | multi-system`;
- `risk`: `low | medium | high`;
- `needsHumanConfirmation`: boolean.

If a probe discovers a materially larger scope or risk, the caller must rerun `route` before executing. AEP does not silently rewrite the route.

### `probeSignals`

The Phase 0 corpus permits only normalized categories, never raw prompts, paths, source text, command arguments, or traces:

- `coordinationPattern`: `semantic-single-step | bounded-parallel-batch | exploratory`;
- `scopeState`: `bounded | expanded`;
- `decomposition`: `none | coupled | independent`;
- `failureState`: `none | repeated`;
- `evidenceState`: `consistent | conflicting`;
- `decisionImpact`: `reversible | hard-to-reverse`;
- `oracleAvailability`: `deterministic | manual | missing`.

A case includes only the signals needed for its contrast.

### `hostCapabilities`

The host reports facts rather than product names:

- whether programmatic tool calling is available;
- whether isolated subagents are available;
- which provider-neutral profiles are available.

An unavailable capability cannot be treated as if it ran. The recommendation must choose a supported shape or declare a fallback reason.

## Recommendations

### `workShape`

| Value | Use when |
|---|---|
| `direct` | One semantic step can complete the bounded task. |
| `programmatic` | A supported deterministic program can coordinate a bounded batch of tool calls. |
| `single-agent` | Exploration, synthesis, or coupled state requires one context owner. |
| `multi-agent` | Workstreams are genuinely independent, the host supports isolation, and an available independent `integration-test` oracle covers integration. |

`single-agent` is the safe default for substantive coupled work. `multi-agent` is exceptional, never a reward for perceived difficulty alone.

### `desiredProfile`

Profiles describe needed capability and budget, not a vendor or model name:

- `bounded-fast`: clear, repeatable, high-volume work with a strong oracle;
- `balanced-execution`: ordinary exploration or implementation;
- `deep-decision`: conflicting evidence, architectural ambiguity, or demanding verification;
- `exceptional-decision`: rare quality-first decisions at a hard-to-reverse boundary.

Mapping these profiles to concrete models, reasoning effort, price, or attempt count belongs to a future host-specific adapter and held-out benchmark.

### `escalationReason`

Use exactly one observed reason:

```text
none
scope-expanded
oracle-missing
evidence-conflict
repeated-failure
high-impact-boundary
capability-unavailable
```

Do not use vague labels such as `task-is-hard`. An escalation reason must be recoverable from structured probe or host facts.

### `verificationOracle`

An oracle is selected before execution:

- `unit-test`;
- `integration-test`;
- `lint-static-analysis`;
- `browser-journey`;
- `diff-invariant`;
- `manual-pending-review`;
- `none`.

It also declares `availability: available | manual | missing` and whether the oracle is independent of the executor. `none` is never a passing oracle. A missing oracle requires low confidence and human confirmation; it does not justify silently choosing a stronger profile.

### Fail-closed fields

- `decisionConfidence`: `high | medium | low`;
- `needsHumanConfirmation`: boolean;
- `allowedFallbacks`: zero or more alternative work shapes supported by the same host and the declared oracle.

An AEP recommendation cannot remove a confirmation gate already set by `route`.

## Later observations

A future shadow receipt may append only bounded observations:

```json
{
  "decisionId": "opaque-local-id",
  "policyVersion": "aep-decision-contract-v0",
  "actualProfile": "balanced-execution",
  "outcome": "pass"
}
```

`outcome` is `pass | fail | uncertain | pending-review`. Phase 0 creates no receipts and stores no prompts, responses, raw traces, provider credentials, or model telemetry.

## Golden corpus

The canonical corpus is split into development and held-out release files. It contains eight two-case minimal contrasts:

| Pair | Controlled input difference | Expected boundary |
|---|---|---|
| 001 | semantic single step vs bounded parallel batch | `direct` vs `programmatic` |
| 002 | semantic single step vs exploration | `direct` vs `single-agent` |
| 003 | coupled vs independent decomposition | `single-agent` vs `multi-agent` |
| 004 | no prior failure vs repeated failure | `bounded-fast` vs `balanced-execution` |
| 005 | consistent vs conflicting evidence | `balanced-execution` vs `deep-decision` |
| 006 | reversible vs hard-to-reverse decision | `deep-decision` vs `exceptional-decision` |
| 007 | programmatic capability available vs unavailable | supported shape vs declared fallback |
| 008 | deterministic oracle present vs missing | proceed vs low-confidence confirmation gate |

Each pair declares `contrastInputPaths`. The validator computes the actual input diff and rejects accidental extra differences. A pair remains wholly in one split so its release member cannot be tuned from a development twin.

All cases are newly written `reviewed-synthetic` structures. They contain no user prompt or copied dataset text.

The two corpus descriptions and all eight pair identifiers are canonical constants, not free-form text fields. The validator also rejects excessive nesting, collection width, total node count, and string length before applying recursive structural checks.

## Deterministic gate

Run from the repository root:

```bash
node scripts/validate-aep-decision-contract.mjs
node --test tests/aep-decision-contract.test.mjs
```

The validator uses only Node.js built-ins, reads the two fixtures, prints bounded JSON, and exits nonzero on a violation. It checks:

- exact field sets and closed enums;
- unique IDs, exactly 16 cases, exactly 8 pairs, and an 8/8 split;
- pair-local splits and exact contrast paths;
- no development/release input duplication;
- provider-neutral profile and work-shape coverage;
- multi-agent admission, host-supported fallbacks, capability, oracle, and confirmation invariants;
- original synthetic provenance and prohibited private/raw payload fields.

This is a fixture contract, not a public JSON Schema and not a runtime router.

## Staged continuation

1. Phase 0: specification, fixtures, validator, and tests.
2. Phase 1: deterministic offline evaluator over frozen cases.
3. Phase 2: opt-in shadow recommendation receipt that changes no execution.
4. Phase 3: held-out profile comparisons per host.
5. Phase 4: an opt-in host adapter with explicit fallback behavior.
6. Phase 5: exceptional-profile admission only after measured benefit.

This experimental release authorizes only the Phase 0 artifacts above. Changing runtime behavior or enabling a host adapter requires a separate future contract and authorization.

## Explicit non-goals

- no model router in Pinmind core;
- no change to `routeTask`, skill discovery metadata, or language-routing fixtures;
- no mandatory agents or programmatic tool calls;
- no automatic learning or self-rewriting policy;
- no raw trace store, external telemetry, dashboard, daemon, deployment, or publication;
- no claim that sixteen synthetic cases prove general routing quality.

## Research basis

The boundary follows current primary guidance rather than adopting a third-party runtime: OpenAI recommends measured model/effort selection, bounded programmatic tool calling, selective independent subagents, and explicit agent evals. RouteLLM and recent routing research support calibrating on representative held-out trajectories rather than hard-coded universal thresholds.

- [OpenAI model selection](https://developers.openai.com/api/docs/guides/latest-model)
- [Programmatic Tool Calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)
- [Responses Multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent)
- [Agent evals](https://developers.openai.com/api/docs/guides/agent-evals)
- [RouteLLM](https://github.com/lm-sys/RouteLLM)
- [SWE-Router](https://arxiv.org/abs/2607.00053)
- [BoundaryRouter](https://arxiv.org/abs/2605.07180)

The research papers are experimental evidence, not universal production rules. Pinmind must recalibrate when hosts, models, prices, tools, or task distributions change.
