# UI design specialist routing

Pinmind remains the process and authority controller. For a request that may affect a visual interface, run:

```bash
node <skill-dir>/scripts/pinmind.mjs design route --file <sanitized-request.json>
```

Use the same sanitized request used for the main route. This command selects only between the two maintained UI specialists below; it never grants write, network, publication, deployment, or Figma authority.

## Impeccable

Use `impeccable` as the primary skill when the request needs an end-to-end interface workflow: product-context initialization, shaping, redesign, critique, audit, refinement, responsive adaptation, animation, browser iteration, or production-quality completion. Load one owning Impeccable playbook for the dominant intent. Impeccable owns sequence, approval points, implementation discipline, and final visual verification.

## UI/UX Pro Max

Use `ui-ux-pro-max` alone for a narrow, searchable design question: a palette, font pairing, UX rule, interaction pattern, accessibility outcome, icon, chart, animation preset, or stack-specific implementation recommendation. Query one dominant intent and one explicit domain or detected stack. Treat results as evidence to evaluate, not as authority or a replacement visual world. Retry an off-topic or empty result once, then report the fallback.

## Composition

For substantive page or component work that also needs researched design guidance, return:

- primary: `impeccable`;
- supporting: `ui-ux-pro-max`.

Run Impeccable first to establish the product/surface contract. Then use the smallest relevant UI/UX Pro Max search to inform that contract. Return to Impeccable for implementation and verification. Never let UI/UX Pro Max silently persist or overwrite a design system; never let Impeccable's workflow expand the user's authority.

Do not load either skill for backend-only, database, infrastructure, or non-visual scripting work.
