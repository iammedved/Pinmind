# Contract and artifact reference

## Contents

1. Artifact layout
2. Contract contents
3. Coverage and freeze
4. Amendments
5. Traceability

## Artifact layout

Use this layout for a persistent run:

```text
.pinmind/
  active.json
  runs/<run-id>/
    brief.md
    contracts/contract-v001.json
    evidence.json
    state.json
    execution.json        # only when work units pay back
    discoveries.md       # only for reusable verified facts
    amendments/          # only after a contract change
    contexts/            # only for scoped subagent bundles
    final.md
```

Treat the sanitized immutable `brief.md`, dated user additions stored as amendment authority, the current frozen contract JSON, `evidence.json`, and `state.json` as canonical. Generate human-readable summaries from them; do not hand-edit generated views. State explicitly when redaction means the stored brief is not byte-for-byte identical to chat input.

## Contract contents

Include:

- immutable source path and hash;
- intent and actors;
- typed obligations: capability, business rule, constraint, preservation, or non-functional target;
- priorities, using MUST only when failure blocks acceptance;
- observable Given/When/Then acceptance criteria, or a statement paired with an explicit observation method;
- invariants that hold across relevant scenarios;
- preservation rules for existing behavior, each with planned evidence;
- allowed and forbidden boundaries;
- public seams used for observation;
- measurable non-functional targets;
- assumptions and canonical `outOfScope` entries;
- planned evidence IDs.

Use `outOfScope` as the only top-level field for exclusions. The kernel rejects the alias `exclusions` and other unknown top-level fields so that a normative scope change cannot be silently ignored.

Keep source quotes short and exact enough to prove coverage. Do not put private helper names, speculative file paths, full function bodies, complete test files, commit messages, or implementation tutorials into the contract.

## Coverage and freeze

Before freeze, perform a context-independent coverage pass using only the immutable brief and candidate contract. Report:

- `missing`: requested intent has no obligation;
- `narrowed`: contract covers less than the request;
- `invented`: unrequested capability became normative;
- `contradictory`: obligations cannot all hold;
- `untestable`: no observable evidence can decide the claim.

Block freeze for unresolved material findings. Permit a recorded assumption only when it is safe, reversible, and does not grant new authority.

Freeze by validating schema and trace completeness, checking source quotes against the sanitized brief, hashing canonical JSON, setting status to `frozen`, and writing a new versioned file. Never overwrite a previous frozen version.

## Amendments

Create an amendment when observable behavior, an acceptance criterion, an invariant, a preservation rule, priority, or boundary changes. Record reason, the exact actual-diff tokens, prior and new values, sanitized authority, and timestamp. Require the authority text to contain source quotes introduced after the initial brief. Create the next contract version and mark evidence affected by the computed diff stale; never trust a hand-written affected list by itself.

Allow an automatic technical clarification only when observable behavior and user authority do not change. Require the user for a product-changing amendment in both auto and guided operation.

Never weaken an assertion, move a requirement out of scope, or rewrite expected behavior simply to obtain green tests.

## Traceability

Maintain both directions:

```text
brief quote -> obligation -> acceptance/invariant -> planned evidence
-> optional work unit -> changed files/commit -> evidence result
```

Require every MUST obligation to have acceptance or invariant coverage, planned evidence, and a final verdict. Require every work unit and material diff to cite an obligation, invariant, preservation rule, decision, or evidence-infrastructure need. Reject untraced work.
