import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  KernelError,
  abandonRun,
  archiveRun,
  initRun,
  loadState,
  reconcileActiveRuns,
  recoverTransition,
} from '../skills/pinmind/scripts/lib/core.mjs';
import { main } from '../skills/pinmind/scripts/pinmind.mjs';

async function workspace() { return mkdtemp(path.join(tmpdir(), 'pinmind-terminal-')); }
async function initialized(runId = 'run-one') {
  const cwd = await workspace();
  await initRun(cwd, runId, 'Exercise explicit terminal lifecycle operations.');
  return cwd;
}
async function missing(file) { await assert.rejects(access(file)); }
async function rejects(action, code) {
  await assert.rejects(action, (error) => error instanceof KernelError && error.code === code);
}

test('abandon is journaled, clears only the canonical pointer, redacts its reason, and is idempotent', async () => {
  const cwd = await initialized();
  const first = await abandonRun(cwd, 'run-one', 'No longer needed; token=synthetic-secret-value.');
  assert.equal(first.status, 'abandoned');
  assert.equal(first.idempotent, false);
  const { files, state } = await loadState(cwd, 'run-one');
  assert.equal(state.status, 'abandoned');
  assert.equal(state.phase, 'abandon');
  assert.match(state.abandonReason, /\[REDACTED\]/);
  assert.doesNotMatch(state.abandonReason, /synthetic-secret-value/);
  await missing(files.active);
  assert.equal((await reconcileActiveRuns(cwd)).classification, 'clean-idle');

  const before = await readFile(files.state, 'utf8');
  const repeated = await abandonRun(cwd, 'run-one', 'A different repeat reason must not rewrite history.');
  assert.equal(repeated.idempotent, true);
  assert.equal(await readFile(files.state, 'utf8'), before);
});

test('abandon rejects an empty reason before changing state', async () => {
  const cwd = await initialized();
  const { files } = await loadState(cwd, 'run-one');
  const before = await Promise.all([readFile(files.state, 'utf8'), readFile(files.active, 'utf8')]);
  await rejects(() => abandonRun(cwd, 'run-one', '   '), 'INVALID_TERMINAL_REASON');
  await rejects(() => abandonRun(cwd, 'run-one', `token=${'x'.repeat(3000)}`), 'INVALID_TERMINAL_REASON');
  assert.deepEqual(await Promise.all([readFile(files.state, 'utf8'), readFile(files.active, 'utf8')]), before);
});

test('archive is terminal-only, non-destructive, journaled, and idempotent', async () => {
  const cwd = await initialized();
  const activeBefore = (await loadState(cwd, 'run-one')).state.stateSha256;
  await rejects(() => archiveRun(cwd, 'run-one', 'Archive active work.'), 'RUN_ACTIVE');
  assert.equal((await loadState(cwd, 'run-one')).state.stateSha256, activeBefore);

  await abandonRun(cwd, 'run-one', 'Superseded by a bounded follow-up.');
  const { files } = await loadState(cwd, 'run-one');
  const preserved = await Promise.all([readFile(files.brief, 'utf8'), readFile(files.evidence, 'utf8')]);
  const first = await archiveRun(cwd, 'run-one', 'Retain the immutable audit trail.');
  assert.equal(first.status, 'archived');
  assert.equal(first.previousStatus, 'abandoned');
  assert.equal(first.idempotent, false);
  const after = await loadState(cwd, 'run-one');
  assert.equal(after.state.status, 'archived');
  assert.equal(after.state.phase, 'archive');
  assert.equal(after.state.archivedFromStatus, 'abandoned');
  assert.deepEqual(await Promise.all([readFile(files.brief, 'utf8'), readFile(files.evidence, 'utf8')]), preserved);
  const marker = JSON.parse(await readFile(files.archive, 'utf8'));
  assert.equal(marker.runId, 'run-one');
  assert.equal(marker.previousStatus, 'abandoned');

  const before = await Promise.all([readFile(files.state, 'utf8'), readFile(files.archive, 'utf8')]);
  const repeated = await archiveRun(cwd, 'run-one', 'Do not rewrite the marker.');
  assert.equal(repeated.idempotent, true);
  assert.deepEqual(await Promise.all([readFile(files.state, 'utf8'), readFile(files.archive, 'utf8')]), before);

  const tampered = JSON.parse(await readFile(files.archive, 'utf8'));
  tampered.reason = 'Tampered after archival.';
  await writeFile(files.archive, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
  await rejects(() => archiveRun(cwd, 'run-one', 'Detect marker tampering.'), 'CORRUPT_STATE');
});

test('terminal transitions recover every bounded interruption without replaying task work', async () => {
  for (const step of [0, 1, 2]) {
    const cwd = await initialized(`abandon-${step}`);
    await rejects(() => abandonRun(cwd, `abandon-${step}`, 'Explicitly stop this run.', { faultAfterStep: step }), 'INJECTED_TRANSITION_CRASH');
    const diagnosis = await reconcileActiveRuns(cwd);
    assert.equal(diagnosis.classification, 'transition-recovery-required');
    assert.equal(diagnosis.pendingTransition.operation, 'abandon');
    await recoverTransition(cwd, diagnosis.pendingTransition.transitionSha256);
    assert.equal((await loadState(cwd, `abandon-${step}`)).state.status, 'abandoned');
    assert.equal((await reconcileActiveRuns(cwd)).classification, 'clean-idle');
  }

  for (const step of [0, 1, 2]) {
    const cwd = await initialized(`archive-${step}`);
    await abandonRun(cwd, `archive-${step}`, 'Prepare terminal state.');
    await rejects(() => archiveRun(cwd, `archive-${step}`, 'Archive without deleting artifacts.', { faultAfterStep: step }), 'INJECTED_TRANSITION_CRASH');
    const diagnosis = await reconcileActiveRuns(cwd);
    assert.equal(diagnosis.classification, 'transition-recovery-required');
    assert.equal(diagnosis.pendingTransition.operation, 'archive');
    await recoverTransition(cwd, diagnosis.pendingTransition.transitionSha256);
    const { files, state } = await loadState(cwd, `archive-${step}`);
    assert.equal(state.status, 'archived');
    assert.equal(JSON.parse(await readFile(files.archive, 'utf8')).previousStatus, 'abandoned');
  }
});

test('concurrent abandonment serializes to one transition and one idempotent repeat', async () => {
  const cwd = await initialized();
  const results = await Promise.all([
    abandonRun(cwd, 'run-one', 'Concurrent terminal request.'),
    abandonRun(cwd, 'run-one', 'Concurrent terminal request.'),
  ]);
  assert.deepEqual(results.map((item) => item.idempotent).sort(), [false, true]);
  assert.equal((await loadState(cwd, 'run-one')).state.status, 'abandoned');
});

test('archive marker symlink is rejected before terminal data can escape the workspace', async () => {
  const cwd = await initialized();
  await abandonRun(cwd, 'run-one', 'Prepare terminal state.');
  const { files } = await loadState(cwd, 'run-one');
  const outside = path.join(await workspace(), 'outside.json');
  await symlink(outside, files.archive);
  await rejects(() => archiveRun(cwd, 'run-one', 'Archive safely.'), 'UNSAFE_STATE_PATH');
  await missing(outside);
});

test('CLI requires explicit reasons and exposes abandon then archive', async () => {
  const cwd = await initialized();
  await rejects(() => main(['abandon', '--run', 'run-one'], cwd), 'MISSING_ARGUMENT');
  const abandoned = await main(['abandon', '--run', 'run-one', '--reason', 'Stop this run explicitly.'], cwd);
  assert.equal(abandoned.status, 'abandoned');
  const archived = await main(['archive', '--run', 'run-one', '--reason', 'Retain its audit trail.'], cwd);
  assert.equal(archived.status, 'archived');
});
