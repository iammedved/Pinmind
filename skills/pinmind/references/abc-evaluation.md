# Offline A/B/C evaluation

The evaluator compares three fixed protocols without importing or installing another controller:

- **A — released Pinmind:** the released controller without the optional readability profile;
- **B — Superpowers + dyslex.ai protocol descriptor:** an independently worded experiment descriptor based on reviewed primary-source behavior, with no copied prompts, imports, or runtime dependency;
- **C — hybrid Pinmind:** released Pinmind plus the selected readability profile and proportional methods.

## Comparable run contract

Store each original sanitized task once in `tasks[]`. Every arm observation references the same task ID. Counterbalance arm order across tasks, while keeping host, model, reasoning effort, tool policy, initial repository state, and stopping condition equal. Use fresh sessions and a blind reviewer when the host permits it. Never tune the hybrid on held-out observations and then call them independent evidence.

Each complete observation records errors, user questions, duration in milliseconds, evidence quality, repeated repairs, and tokens. Evidence quality is a 0–100 rubric: public-seam relevance (30), freshness (25), reproducibility (20), negative/sensitivity coverage (15), and clear limitation reporting (10). Keep the component worksheet with the experiment even though the compact exchange schema stores the total.

Token data is valid only as `authoritative-receipt` when a host adapter verifies the receipt identifier and value. A JSON status or identifier is not authority by itself. The standalone CLI has no host verifier and therefore rejects purported authoritative receipts; use `unavailable` there. Library hosts pass a synchronous `verifyReceipt` callback to `evaluateAbc` or `validateAbcEvaluation`; it verifies already obtained host evidence and does not add network behavior to the evaluator. Aggregate output reports only `receiptCount`, never raw receipt identifiers. Estimates, character conversions, catalog sizes, or remembered Goal counters are not token measurements. If any observation in an arm lacks authoritative data, the arm token result is `unavailable`.

Use `pending-review` with no observations when the comparable host runs or independent reviewer are unavailable. Passing schema tests proves only that the experiment record is bounded and comparable; it does not prove universal product superiority.

```bash
node scripts/evaluate-abc.mjs
node scripts/evaluate-abc.mjs --fixture <record.json> --profile evals/readability-profile.json
```
