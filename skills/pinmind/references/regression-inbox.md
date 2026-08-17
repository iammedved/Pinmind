# Regression-led Pinmind improvement

Use this reference only when Pinmind itself exhibits an activation miss, route misclassification, unsafe downgrade, composition miss, or evidence/receipt defect.

## Capture before policy change

Record a sanitized reproducible case with:

- event type: `activation-miss`, `route-misclassification`, `unsafe-downgrade`, `composition-miss`, or `evidence-receipt-defect`;
- exact phrasing after secret redaction;
- host, surface, plugin version, and fresh-session status;
- expected and actual activation, route, axes, composition, or receipt behavior;
- observable impact and the smallest valid reproduction.

Add the case to the appropriate deterministic or host-smoke corpus before editing metadata, router policy, or instructions. An activation observation belongs to the host corpus; do not pretend the post-activation router can reproduce host selection.

## RED/GREEN update rule

1. Reproduce the defect and preserve the RED result.
2. Change the smallest metadata, policy, reference, or kernel seam that owns the behavior.
3. Re-run the new case, the full RU/EN corpus, and the kernel suite.
4. Forward-test with fresh context when model behavior changed.
5. Record the result and rollback condition.

Do not automatically rewrite Pinmind after each task. A single preference, awkward answer, or unrepeatable host choice is an observation, not authority to drift the controller.
