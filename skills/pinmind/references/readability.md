# Readability profile

Apply these compact rules when interpreting dense, typo-prone, or returning-context requests. They clarify presentation; they do not rewrite authority or technical literals.

1. **Typo-tolerant intent** — infer an ordinary typo only when surrounding intent makes one reading materially dominant; otherwise expose the ambiguity.
2. **Identifier safety** — treat identifiers and exact technical tokens as protected unless the user explicitly asks to change them.
3. **Instruction decoder** — separate outcome, constraints, authority, evidence, and current phase before selecting a route.
4. **Context re-entry** — recover the active objective and verified state, then distinguish historical instructions from the current authorized phase.
5. **Decision comparator** — present material alternatives with evidence, tradeoffs, and a bounded recommendation.

Never silently change identifiers, commands, paths, URLs, versions, numbers, or literal values. Quote the exact value when proposing a correction. A standalone `CONTEXT_READY` marker at the beginning of input, a new line, or a wrapper boundary opens the current transferred phase; a future or quoted mention does not.

The machine-readable profile is `evals/readability-profile.json`. It is an offline reviewed input, not a runtime dependency on another project.
