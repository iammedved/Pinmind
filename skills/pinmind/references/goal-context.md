# Optional Goal context

Goal is a host capability for long-running work, not a Pinmind dependency. Pinmind owns route, risk, contract, evidence, and lifecycle. Goal owns only the durable objective, stopping condition, and host status. Neither layer grants authority to the other.

## Versioned adapter input

The pure `evaluateGoalContext` seam accepts no context, `null`, or this strict union:

```ts
type GoalContext =
  | { schemaVersion: 1; present: false }
  | {
      schemaVersion: 1;
      present: true;
      goalId: string;
      objective: string;
      status: "active" | "paused" | "complete" | "blocked";
      stoppingCondition?: string;
    };
```

The host may also supply an expected `{ goalId }` binding. A mismatch fails closed. The adapter is pure: it performs no filesystem, network, slash-command, Goal-status, or Pinmind-state mutation. It returns only eligibility, mode, and a deterministic reason; it never returns an authority or evidence grant.

## Status matrix

| Context | Mode | Continue under Goal |
|---|---|---|
| missing, `null`, or `present: false` | `standalone` | Pinmind may work normally; no Goal link is inferred |
| matching `active` | `goal-attached` | yes, within the user's existing authority |
| `paused` | `goal-attached` | no changes until the host resumes it |
| `complete` | `goal-attached` | no new stage under the old Goal |
| `blocked` | `goal-attached` | no changes until the blocker is resolved |
| malformed or mismatched | `goal-attached` | fail closed |

Goal is never proof that work is complete. Pinmind evidence and the real public seam remain the proof. Pinmind core never calls `/goal`, creates a Goal, changes its status, or copies a full outcome contract into it.

## Re-entry boundary

An existing `.pinmind/active.json` is not automatically the current task. First reconcile it read-only. Resume only when the caller explicitly identifies the run and, when Goal context is present, the host binding matches. Without Goal, explicit standalone resume remains available for a known current run; do not infer ownership from a stale pointer alone. A short continuation is not a durable-state lookup: it must match the identified current run, and a new cancellation or restriction applies before further work. A worker receives only its parent mandate and never resumes or creates canonical state.
