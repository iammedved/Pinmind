import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ReleaseVerificationError,
  EXPECTED_COMMANDS,
  assertContainedRegularFile,
  assertTrackedFile,
  loadReleaseManifest,
  validateReleaseManifest,
  validateWorkflow,
  runVerificationCommands,
} from '../scripts/verify-release.mjs';
import { PluginValidationError, validatePluginAndSkills } from '../scripts/validate-plugin-skill.mjs';
import { RepositoryDiffError, checkRepositoryDiff } from '../scripts/check-repository-diff.mjs';
import { ReleaseIdentityError, checkReleaseIdentity, isSafeReleaseEmail, validateIdentityRecords } from '../scripts/check-release-identity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const clone = (value) => structuredClone(value);
const rejectsCode = async (action, code) => assert.rejects(action, (error) => error instanceof ReleaseVerificationError && error.code === code);

test('canonical release manifest, workflow, plugin, and skill metadata validate', async () => {
  const manifest = await loadReleaseManifest(root);
  const result = await validateReleaseManifest(manifest, root);
  assert.equal(result.ok, true);
  assert.equal(result.nodeVersion, '24.19.0');
  assert.equal(result.frozenInputs, 6);
  assert.equal(result.commands, EXPECTED_COMMANDS.length);
  assert.equal(result.inventory.testFiles.length, 4);
  assert.equal(result.inventory.fixtureCases.routes, 227);
  assert.deepEqual(await validateWorkflow(root), { ok: true, nodeVersion: '24.19.0' });
  const plugin = await validatePluginAndSkills(root); assert.equal(plugin.ok, true); assert.deepEqual(plugin.skills, ['pinmind']);
});

test('release manifest rejects digest, schema, duplicate, path, and command drift', async () => {
  const source = await loadReleaseManifest(root);
  await rejectsCode(() => validateReleaseManifest(source, root, { runtimeVersion: 'v24.18.0' }), 'RUNTIME_VERSION_DRIFT');
  const digest = clone(source); digest.frozenInputs[0].sha256 = '0'.repeat(64);
  await rejectsCode(() => validateReleaseManifest(digest, root), 'DIGEST_MISMATCH');
  const unknown = clone(source); unknown.unreviewed = true;
  await rejectsCode(() => validateReleaseManifest(unknown, root), 'UNKNOWN_FIELD');
  const duplicate = clone(source); duplicate.frozenInputs[1] = clone(duplicate.frozenInputs[0]);
  await rejectsCode(() => validateReleaseManifest(duplicate, root), 'DUPLICATE_INPUT');
  const unsafe = clone(source); unsafe.frozenInputs[0].path = '../outside';
  await rejectsCode(() => validateReleaseManifest(unsafe, root), 'UNSAFE_PATH');
  const absolute = clone(source); absolute.frozenInputs[0].path = '/tmp/outside';
  await rejectsCode(() => validateReleaseManifest(absolute, root), 'UNSAFE_PATH');
  const command = clone(source); command.commands[0].argv[2] = 'tests/other.test.mjs';
  await rejectsCode(() => validateReleaseManifest(command, root), 'COMMAND_DRIFT');
});

test('release manifest rejects inventory drift and missing frozen inputs', async () => {
  const source = await loadReleaseManifest(root);
  const count = clone(source); count.inventory.fixtureCases.routes -= 1;
  await rejectsCode(() => validateReleaseManifest(count, root), 'INVENTORY_DRIFT');
  const missing = clone(source); missing.frozenInputs.pop();
  await rejectsCode(() => validateReleaseManifest(missing, root), 'FROZEN_INPUTS_CHANGED');
});

test('verification runner executes fixed argv without a shell and propagates failure', async () => {
  const calls = [];
  const ok = runVerificationCommands(root, [['node', '--check', 'ok.mjs']], (command, args, options) => {
    calls.push({ command, args, options }); return { status: 0, signal: null };
  });
  assert.deepEqual(ok, { ok: true, commands: 1 });
  assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.cwd, root);
  assert.throws(() => runVerificationCommands(root, [['node', '--check', 'bad.mjs']], () => ({ status: 7, signal: null })), (error) => error instanceof ReleaseVerificationError && error.code === 'COMMAND_FAILED');
});

test('release inputs must be physical regular files tracked by Git', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'pinmind-release-input-')); t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(path.join(workspace, 'tracked.txt'), 'reviewed\n');
  assert.equal(await assertContainedRegularFile(workspace, 'tracked.txt'), path.join(workspace, 'tracked.txt'));
  assert.throws(() => assertTrackedFile(workspace, 'tracked.txt'), (error) => error instanceof ReleaseVerificationError && error.code === 'UNTRACKED_INPUT');
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: workspace, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['add', '--', 'tracked.txt'], { cwd: workspace, shell: false }).status, 0);
  assert.doesNotThrow(() => assertTrackedFile(workspace, 'tracked.txt'));
  await symlink('tracked.txt', path.join(workspace, 'link.txt'));
  await rejectsCode(() => assertContainedRegularFile(workspace, 'link.txt'), 'UNSAFE_PATH');
});

test('plugin and skill validator rejects malformed metadata and symlinked skills', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'pinmind-plugin-validator-')); t.after(() => rm(workspace, { recursive: true, force: true }));
  const plugin = {
    name: 'pinmind', version: '0.6.1', description: 'Test plugin metadata.', author: { name: 'Pinmind Project' }, license: 'MIT', keywords: ['pinmind'], skills: './skills/',
    interface: { displayName: 'Pinmind', composerIcon: './docs/assets/pinmind-hero.png', logo: './docs/assets/pinmind-hero.png', shortDescription: 'Test Pinmind plugin', longDescription: 'A validator fixture for Pinmind.', developerName: 'Pinmind Project', category: 'Productivity', capabilities: ['Analysis'], defaultPrompt: ['Audit this fixture.'] },
  };
  const marketplace = { name: 'pinmind-project', plugins: [{ name: 'pinmind', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE' } }] };
  await mkdir(path.join(workspace, '.codex-plugin'), { recursive: true }); await mkdir(path.join(workspace, '.agents/plugins'), { recursive: true }); await mkdir(path.join(workspace, 'skills/pinmind'), { recursive: true }); await mkdir(path.join(workspace, 'docs/assets'), { recursive: true }); await writeFile(path.join(workspace, 'docs/assets/pinmind-hero.png'), 'fixture-image');
  const writePlugin = (value) => writeFile(path.join(workspace, '.codex-plugin/plugin.json'), `${JSON.stringify(value)}\n`);
  const writeSkill = (value) => writeFile(path.join(workspace, 'skills/pinmind/SKILL.md'), value);
  await writePlugin(plugin); await writeFile(path.join(workspace, '.agents/plugins/marketplace.json'), `${JSON.stringify(marketplace)}\n`); await writeSkill('---\nname: pinmind\ndescription: "Test controller skill."\n---\n\n# Pinmind\n');
  assert.equal((await validatePluginAndSkills(workspace)).ok, true);

  await writePlugin({ ...plugin, version: '0.6.1+codex.test' });
  await assert.rejects(() => validatePluginAndSkills(workspace), (error) => error instanceof PluginValidationError && error.code === 'INVALID_PLUGIN');
  await writePlugin({ ...plugin, version: '0.6.3-rc.1' });
  await assert.rejects(() => validatePluginAndSkills(workspace), (error) => error instanceof PluginValidationError && error.code === 'INVALID_PLUGIN');
  await writePlugin({ ...plugin, unexpected: true });
  await assert.rejects(() => validatePluginAndSkills(workspace), (error) => error instanceof PluginValidationError && error.code === 'INVALID_PLUGIN');
  await writePlugin({ ...plugin, interface: { ...plugin.interface, logo: '../outside.png' } });
  await assert.rejects(() => validatePluginAndSkills(workspace), (error) => error instanceof PluginValidationError && error.code === 'INVALID_PLUGIN');
  await writePlugin(plugin); await writeSkill('---\nname: pinmind\nname: pinmind\ndescription: duplicate\n---\n');
  await assert.rejects(() => validatePluginAndSkills(workspace), (error) => error instanceof PluginValidationError && error.code === 'INVALID_SKILL');
  await writeSkill('---\nname: pinmind\ndescription: "Test controller skill."\n---\n');
  const external = await mkdtemp(path.join(tmpdir(), 'pinmind-external-skill-')); t.after(() => rm(external, { recursive: true, force: true }));
  await writeFile(path.join(external, 'SKILL.md'), '---\nname: pinmind\ndescription: external\n---\n');
  await rm(path.join(workspace, 'skills/pinmind'), { recursive: true }); await symlink(external, path.join(workspace, 'skills/pinmind'));
  await assert.rejects(() => validatePluginAndSkills(workspace), (error) => error instanceof PluginValidationError && error.code === 'INVALID_PATH');
});

test('repository diff check covers local untracked files and GitHub commit ranges', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'pinmind-diff-check-')); t.after(() => rm(workspace, { recursive: true, force: true }));
  const git = (...args) => spawnSync('git', args, { cwd: workspace, shell: false, encoding: 'utf8' });
  assert.equal(git('init', '-q').status, 0); await writeFile(path.join(workspace, 'tracked.txt'), 'clean\n');
  assert.equal(git('add', '--', 'tracked.txt').status, 0); assert.equal(git('-c', 'user.name=Pinmind Test', '-c', 'user.email=pinmind@example.invalid', 'commit', '-qm', 'baseline').status, 0);
  const base = git('rev-parse', 'HEAD').stdout.trim();

  await writeFile(path.join(workspace, 'untracked.txt'), 'bad  \n');
  await assert.rejects(() => checkRepositoryDiff(workspace), (error) => error instanceof RepositoryDiffError && error.code === 'DIFF_CHECK_FAILED');
  await writeFile(path.join(workspace, 'untracked.txt'), 'clean\n'); await writeFile(path.join(workspace, 'oversized.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
  await assert.rejects(() => checkRepositoryDiff(workspace), (error) => error instanceof RepositoryDiffError && error.code === 'DIFF_CHECK_FAILED');
  await rm(path.join(workspace, 'oversized.txt')); await writeFile(path.join(workspace, 'tracked.txt'), 'bad\t\n');
  await assert.rejects(() => checkRepositoryDiff(workspace), (error) => error instanceof RepositoryDiffError && error.code === 'DIFF_CHECK_FAILED');

  await writeFile(path.join(workspace, 'tracked.txt'), 'bad committed  \n'); assert.equal(git('add', '--', 'tracked.txt').status, 0);
  assert.equal(git('-c', 'user.name=Pinmind Test', '-c', 'user.email=pinmind@example.invalid', 'commit', '-qm', 'bad whitespace').status, 0);
  const head = git('rev-parse', 'HEAD').stdout.trim();
  await assert.rejects(() => checkRepositoryDiff(workspace, { env: { PINMIND_DIFF_BASE_SHA: base, PINMIND_DIFF_HEAD_SHA: head } }), (error) => error instanceof RepositoryDiffError && error.code === 'DIFF_CHECK_FAILED');
  await writeFile(path.join(workspace, 'second.txt'), 'clean\n'); assert.equal(git('add', '--', 'second.txt').status, 0);
  assert.equal(git('-c', 'user.name=Pinmind Test', '-c', 'user.email=pinmind@example.invalid', 'commit', '-qm', 'second clean commit').status, 0);
  const secondHead = git('rev-parse', 'HEAD').stdout.trim();
  await assert.rejects(() => checkRepositoryDiff(workspace, { env: { PINMIND_DIFF_BASE_SHA: '0'.repeat(40), PINMIND_DIFF_HEAD_SHA: secondHead } }), (error) => error instanceof RepositoryDiffError && error.code === 'DIFF_CHECK_FAILED');
  await assert.rejects(() => checkRepositoryDiff(workspace, { env: { PINMIND_DIFF_BASE_SHA: 'bad', PINMIND_DIFF_HEAD_SHA: head } }), (error) => error instanceof RepositoryDiffError && error.code === 'INVALID_DIFF_RANGE');
});

test('release identity gate accepts safe commits and GitHub merge metadata but rejects broader personal identities', () => {
  const safe = 'a'.repeat(40); const unsafe = 'b'.repeat(40);
  const parentOne = 'c'.repeat(40); const parentTwo = 'd'.repeat(40);
  assert.equal(isSafeReleaseEmail('271581472+iammedved@users.noreply.github.com'), true);
  assert.equal(isSafeReleaseEmail('pinmind@example.invalid'), true);
  assert.equal(isSafeReleaseEmail('maintainer@personal.example'), false);
  assert.equal(validateIdentityRecords([{ sha: safe, authorEmail: 'pinmind@example.invalid', committerEmail: 'noreply@github.com' }]), 1);
  assert.equal(validateIdentityRecords([{ sha: safe, parentShas: [parentOne, parentTwo], authorEmail: 'maintainer@personal.example', committerEmail: 'noreply@github.com', providerSignatureVerified: true }]), 1);
  assert.throws(() => validateIdentityRecords([{ sha: unsafe, authorEmail: 'maintainer@personal.example', committerEmail: 'noreply@github.com' }]), (error) => error instanceof ReleaseIdentityError && error.code === 'UNSAFE_RELEASE_IDENTITY' && !error.message.includes('personal.example'));
  assert.throws(() => validateIdentityRecords([{ sha: unsafe, parentShas: [parentOne], authorEmail: 'maintainer@personal.example', committerEmail: 'noreply@github.com', providerSignatureVerified: true }]), (error) => error instanceof ReleaseIdentityError && error.code === 'UNSAFE_RELEASE_IDENTITY');
  assert.throws(() => validateIdentityRecords([{ sha: unsafe, parentShas: [parentOne, parentTwo], authorEmail: 'maintainer@personal.example', committerEmail: 'noreply@github.com', providerSignatureVerified: false }]), (error) => error instanceof ReleaseIdentityError && error.code === 'UNSAFE_RELEASE_IDENTITY');
  assert.throws(() => validateIdentityRecords([{ sha: unsafe, parentShas: [parentOne, parentTwo], authorEmail: 'maintainer@personal.example', committerEmail: '271581472+iammedved@users.noreply.github.com', providerSignatureVerified: true }]), (error) => error instanceof ReleaseIdentityError && error.code === 'UNSAFE_RELEASE_IDENTITY');

  const calls = [];
  const spawn = (_command, args) => {
    calls.push(args);
    if (args[0] === 'merge-base') return { status: 0, stdout: `${safe}\n`, stderr: '' };
    if (args[0] === 'log') return { status: 0, stdout: `${unsafe}\t${parentOne}\tpinmind@example.invalid\tnoreply@github.com\n`, stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
  assert.deepEqual(checkReleaseIdentity(root, { env: { PINMIND_DIFF_BASE_SHA: safe, PINMIND_DIFF_HEAD_SHA: unsafe }, spawn }), { ok: true, mode: 'commit-range', base: safe, head: unsafe, commits: 1 });
  assert.deepEqual(calls.map((args) => args[0]), ['merge-base', 'log']);

  const mergeSpawn = (_command, args) => {
    if (args[0] === 'merge-base') return { status: 0, stdout: `${safe}\n`, stderr: '' };
    if (args[0] === 'log') return { status: 0, stdout: `${unsafe}\t${parentOne} ${parentTwo}\tmaintainer@personal.example\tnoreply@github.com\n`, stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
  assert.deepEqual(checkReleaseIdentity(root, { env: { PINMIND_DIFF_BASE_SHA: safe, PINMIND_DIFF_HEAD_SHA: unsafe }, spawn: mergeSpawn, verifyProviderMerge: () => true }), { ok: true, mode: 'commit-range', base: safe, head: unsafe, commits: 1 });
  assert.throws(() => checkReleaseIdentity(root, { env: { PINMIND_DIFF_BASE_SHA: safe, PINMIND_DIFF_HEAD_SHA: unsafe }, spawn: mergeSpawn, verifyProviderMerge: () => false }), (error) => error instanceof ReleaseIdentityError && error.code === 'UNSAFE_RELEASE_IDENTITY');
});

test('workflow is a single read-only CI gate with immutable action revisions', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request:/); assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/); assert.doesNotMatch(workflow, /contents:\s+write|secrets\.|workflow_dispatch|schedule:/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /node-version-file:\s+['"]?\.node-version/);
  assert.match(workflow, /run:\s+node scripts\/verify-release\.mjs --run/);
  assert.match(workflow, /PINMIND_DIFF_BASE_SHA:\s+\$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/);
  assert.match(workflow, /PINMIND_DIFF_HEAD_SHA:\s+\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(workflow, /PINMIND_DIFF_HEAD_SHA:\s+\$\{\{ github\.sha \}\}/);
});
