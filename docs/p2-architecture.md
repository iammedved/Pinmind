# P2 architecture decision: adapters before runtime

Status: accepted design, 2026-08-17. Implementation remains gated per slice.

## Decision

Pinmind will keep routing, contracts, recovery, evidence, and finalization in its small dependency-free kernel. P2 host integration will use separate, opt-in adapters with their own versioned artifacts. No P2 adapter may silently change route, risk, authority, contract, or lifecycle state.

This is deliberately narrower than importing an agent runtime. It preserves useful guarantees from adjacent systems while avoiding a daemon, database, trace warehouse, workflow engine, or model call whose only purpose is to choose another model.

## Options considered

| Option | Locality and reversibility | Testability | Runtime/token cost | Decision |
|---|---|---|---|---|
| Add P2 policy to the kernel first | Poor: expands every state and crash boundary | Requires a larger cross-product before any host benefit exists | Permanent overhead | Rejected |
| Add four independent host adapters | Strong: each adapter can remain absent or be removed | Fixture-testable at public seams | Paid only when invoked | Selected |
| Adopt LangGraph, Temporal, or Agents SDK as the Pinmind runtime | Weak for a skills-only plugin | Mature upstream behavior, but a large integration surface | Service/runtime overhead | Rejected unless Pinmind later owns long-running workflows |

The core-first option would make Pinmind look more capable while leaving the most important enforcement points—the host model call and the external effect—outside its control. Adapter-first keeps claims aligned with what the project can actually observe or guard.

## Ordered slices

### P2A. Activation observation ledger

An evaluation-only adapter may record one sanitized observation per fresh host session. Its versioned record contains:

- schema version and observation ID;
- plugin artifact SHA-256, host name/version, and fresh-session flag;
- corpus version and SHA-256, case ID, and expected eligibility;
- explicit or implicit selection mode, observed selection, and post-activation route;
- metadata snapshot SHA-256 and route-policy version;
- timestamp and result classification.

Free-form prompts, responses, notes, personal paths, and traces are excluded. A validator must reject unknown fields, unsupported host declarations, duplicate observation IDs, missing hashes, and an implicit-activation claim without a fresh session. This slice is admitted first because it is read-only, does not alter execution, and directly measures the host seam that deterministic route tests cannot prove.

### P2B. One-shot Codex usage receipt

A foreground adapter may consume the public terminal event from one `codex exec --json` turn and copy the five host-reported usage fields without reinterpretation. It may write the existing receipt only with `scope: "turn"`; it must never overwrite a broader authoritative receipt. Zero or multiple terminal-success events, truncation, failure, or malformed input produce `unavailable`, never an estimate.

The adapter stores no prompt or response body. It is admitted only after fixture tests and real CLI trials meet the thresholds in the roadmap.

### P2C. Authorization receipt plus effect guard

An authorization receipt is not enforcement by itself. This slice begins only when one concrete effect adapter exists and can check the receipt immediately before the effect. The receipt binds a contract hash, effect class, exact target/scope, sanitized authority evidence, decision, and expiry/supersession state. The effect adapter must also use an idempotency key or durable result identifier and persist `attempted | succeeded | failed | unknown` without automatic retry.

If Pinmind cannot guard the actual effect, the record is audit evidence only and must not be presented as authorization enforcement.

### P2D. Luna/Terra/Sol shadow dispatch

Dispatch remains outside the kernel and counterfactual until the host exposes a verified pre-turn model-selection hook. It receives a frozen route snapshot and emits a recommendation receipt; it does not launch work.

Initial hypotheses:

| Admission | Recommendation | Boundary |
|---|---|---|
| `bounded-fast`, low/medium risk, deterministic oracle | Luna / low | One bounded attempt, no fan-out |
| ordinary exploration, implementation, or review | Terra / medium | Default comparison baseline |
| evidence conflict, repeated semantic failure after strategy change, or cross-cutting architectural ambiguity | Sol / high | One declared work unit and independent oracle |
| explicitly authorized exceptional hard-to-reverse decision | Sol / xhigh or measured host-supported maximum | Rare, budget-capped admission |

Risk and reasoning complexity stay independent. A stronger model never grants authority. Allow at most one upward handoff per work unit. The receiving model gets only the work-unit ID, policy version, contract-slice hash, route/risk/authority state, oracle, bounded failure reason, and workspace references—not accumulated conversation or chain-of-thought.

Operational dispatch is admitted edge by edge only when held-out results show all of the following:

- zero unsafe downgrade and zero authority/evidence regression;
- no increase in unresolved failures;
- a host-observed latency, token, or cost benefit under the same workload;
- comparison at the same effort and one lower effort before increasing effort;
- rollback to shadow after any safety, contract, receipt-integrity, or budget-stop failure.

Prices, context limits, model availability, and supported effort values are host observations, not constants in Pinmind policy.

## Artifact boundaries

Each adapter owns a closed, versioned schema. Absence means disabled. Adapter artifacts may reference Pinmind run and contract hashes but may not mutate `state.json`, `contract-vNNN.json`, evidence, or route output. Existing state format remains unchanged.

Receipts contain identifiers, hashes, bounded enums, and authoritative host counters only. They exclude raw prompts, responses, source text, command arguments, credentials, personal paths, inferred token counts, inferred cost, and self-awarded quality scores.

## Test and release gates

Every implemented slice requires at least 50 deterministic positive/negative cases, including malformed and privacy-rejection cases. Any slice that writes more than one file also requires the existing crash-boundary fault discipline. Real-host pilots are reported separately from fixture validation.

The following are not implementation claims:

- installing a plugin does not prove that an already-open session loaded it;
- a deterministic route corpus does not prove implicit host activation;
- a receipt without a direct effect guard does not enforce authorization;
- a model recommendation does not prove better quality or lower cost;
- local state recovery does not replay external effects or resume a host process.

## Sources and retained boundaries

- [OpenAI model selection guidance](https://developers.openai.com/api/docs/guides/latest-model): benchmark representative work, start with appropriate effort, and keep autonomy/approval boundaries explicit.
- [OpenAI model catalog](https://developers.openai.com/api/docs/models): model positioning is a starting hypothesis, not Pinmind evidence.
- [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/): bind approval to a pending call and resume durable state; Pinmind does not import the SDK.
- [OpenAI plugin skill evaluation](https://github.com/openai/plugins/blob/main/plugins/plugin-eval/skills/evaluate-skill/SKILL.md): compare against a baseline with objective assertions and measured cost.
- [Superpowers verification before completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md): fresh evidence precedes success claims; Pinmind does not mandate its entire workflow.
- [Anthropic skill creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md): use progressive disclosure and remove material that does not earn its context cost.
- [LangGraph durable execution](https://docs.langchain.com/oss/python/langgraph/durable-execution): persistence and idempotent side-effect boundaries matter for replay; Pinmind does not adopt its persistence stack.
