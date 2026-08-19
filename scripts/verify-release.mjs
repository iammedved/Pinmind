#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = 'evals/release-manifest.json';
const NODE_VERSION_PATH = '.node-version';
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const EXPECTED_WORKFLOW = `name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: '.node-version'
      - name: Run release gate
        run: node scripts/verify-release.mjs --run
        env:
          PINMIND_DIFF_BASE_SHA: \${{ github.event.pull_request.base.sha || github.event.before }}
          PINMIND_DIFF_HEAD_SHA: \${{ github.event.pull_request.head.sha || github.sha }}
`;
const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'algorithm', 'nodeVersion', 'frozenInputs', 'commands', 'inventory']);
const INPUT_KEYS = new Set(['role', 'path', 'sha256']);
const COMMAND_KEYS = new Set(['id', 'argv']);
const INVENTORY_KEYS = new Set(['testFiles', 'fixtureCases']);
const TEST_FILE_KEYS = new Set(['path', 'topLevelDeclarations']);

export const EXPECTED_FROZEN_INPUTS = Object.freeze([
  ['router', 'skills/pinmind/scripts/lib/core.mjs'],
  ['language-schema-validator', 'scripts/evaluate-language-routing.mjs'],
  ['github-web-flow-key', 'scripts/keys/github-web-flow.gpg'],
  ['development-corpus', 'evals/fixtures/language-dev.json'],
  ['held-out-release-corpus', 'evals/fixtures/language-release.json'],
  ['unsafe-negative-regressions', 'evals/fixtures/routes.json'],
]);

export const EXPECTED_COMMANDS = Object.freeze([
  Object.freeze({ id: 'kernel-tests', argv: Object.freeze(['node', '--test', 'tests/kernel.test.mjs']) }),
  Object.freeze({ id: 'aep-validator', argv: Object.freeze(['node', 'scripts/validate-aep-decision-contract.mjs']) }),
  Object.freeze({ id: 'aep-tests', argv: Object.freeze(['node', '--test', 'tests/aep-decision-contract.test.mjs']) }),
  Object.freeze({ id: 'parallel-admission-validator', argv: Object.freeze(['node', 'scripts/validate-parallel-admission.mjs']) }),
  Object.freeze({ id: 'parallel-admission-tests', argv: Object.freeze(['node', '--test', 'tests/parallel-admission.test.mjs']) }),
  Object.freeze({ id: 'language-evaluator', argv: Object.freeze(['node', 'scripts/evaluate-language-routing.mjs']) }),
  Object.freeze({ id: 'language-tests', argv: Object.freeze(['node', '--test', 'tests/language-routing-evaluator.test.mjs']) }),
  Object.freeze({ id: 'release-tests', argv: Object.freeze(['node', '--test', 'tests/release-verification.test.mjs']) }),
  Object.freeze({ id: 'plugin-skill-validator', argv: Object.freeze(['node', 'scripts/validate-plugin-skill.mjs']) }),
  Object.freeze({ id: 'core-syntax', argv: Object.freeze(['node', '--check', 'skills/pinmind/scripts/lib/core.mjs']) }),
  Object.freeze({ id: 'cli-syntax', argv: Object.freeze(['node', '--check', 'skills/pinmind/scripts/pinmind.mjs']) }),
  Object.freeze({ id: 'release-identity', argv: Object.freeze(['node', 'scripts/check-release-identity.mjs']) }),
  Object.freeze({ id: 'diff-check', argv: Object.freeze(['node', 'scripts/check-repository-diff.mjs']) }),
]);

const EXPECTED_TEST_FILES = Object.freeze([
  'tests/kernel.test.mjs',
  'tests/aep-decision-contract.test.mjs',
  'tests/parallel-admission.test.mjs',
  'tests/language-routing-evaluator.test.mjs',
  'tests/release-verification.test.mjs',
]);

const FIXTURE_PATHS = Object.freeze({
  routes: 'evals/fixtures/routes.json',
  activation: 'evals/fixtures/activation-smoke.json',
  aepDev: 'evals/fixtures/aep-decision-contract-v0.dev.json',
  aepRelease: 'evals/fixtures/aep-decision-contract-v0.release.json',
  parallelAdmission: 'evals/fixtures/parallel-admission-v0.json',
  languageDev: 'evals/fixtures/language-dev.json',
  languageRelease: 'evals/fixtures/language-release.json',
});

export class ReleaseVerificationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'ReleaseVerificationError';
    this.code = code;
  }
}

function fail(code, detail) { throw new ReleaseVerificationError(code, detail); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function assertClosedObject(value, allowedKeys, label) {
  if (!isObject(value)) fail('INVALID_SCHEMA', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) fail('UNKNOWN_FIELD', `${label}.${key}`);
  for (const key of allowedKeys) if (!Object.hasOwn(value, key)) fail('MISSING_FIELD', `${label}.${key}`);
}

function assertSafeRelativePath(candidate, label) {
  if (typeof candidate !== 'string' || !candidate || path.posix.isAbsolute(candidate) || candidate.includes('\\')) fail('UNSAFE_PATH', label);
  const normalized = path.posix.normalize(candidate);
  if (normalized !== candidate || normalized === '..' || normalized.startsWith('../')) fail('UNSAFE_PATH', label);
}

export async function assertContainedRegularFile(root, relativePath) {
  assertSafeRelativePath(relativePath, relativePath);
  const physicalRoot = await realpath(root);
  let cursor = root;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let metadata;
    try { metadata = await lstat(cursor); }
    catch (error) { fail('MISSING_INPUT', `${relativePath}: ${error.message}`); }
    if (metadata.isSymbolicLink()) fail('UNSAFE_PATH', `${relativePath} contains a symbolic link`);
    if (index < segments.length - 1 && !metadata.isDirectory()) fail('UNSAFE_PATH', `${relativePath} has a non-directory parent`);
    if (index === segments.length - 1 && !metadata.isFile()) fail('MISSING_INPUT', `${relativePath} is not a regular file`);
  }
  const physicalFile = await realpath(cursor);
  if (!physicalFile.startsWith(`${physicalRoot}${path.sep}`)) fail('UNSAFE_PATH', `${relativePath} escapes the repository`);
  return physicalFile;
}

export function assertTrackedFile(root, relativePath, spawn = spawnSync) {
  const result = spawn('git', ['ls-files', '--error-unmatch', '--', relativePath], { cwd: root, shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0 || result.stdout.trim() !== relativePath) fail('UNTRACKED_INPUT', relativePath);
}

async function readJson(root, relativePath) {
  try { return JSON.parse(await readFile(path.join(root, relativePath), 'utf8')); }
  catch (error) { fail('READ_FAILED', `${relativePath}: ${error.message}`); }
}

async function sha256File(root, relativePath) {
  const physicalFile = await assertContainedRegularFile(root, relativePath);
  assertTrackedFile(root, relativePath);
  try {
    return createHash('sha256').update(await readFile(physicalFile)).digest('hex');
  }
  catch (error) { fail('MISSING_INPUT', `${relativePath}: ${error.message}`); }
}

export async function loadReleaseManifest(root) { return readJson(root, MANIFEST_PATH); }

async function countInventory(root) {
  let discoveredTests;
  try { discoveredTests = (await readdir(path.join(root, 'tests'))).filter((name) => name.endsWith('.test.mjs')).map((name) => `tests/${name}`).sort(); }
  catch (error) { fail('INVENTORY_DRIFT', `tests: ${error.message}`); }
  if (!sameJson(discoveredTests, [...EXPECTED_TEST_FILES].sort())) fail('INVENTORY_DRIFT', 'the reviewed test-file set changed');
  const testFiles = [];
  for (const relativePath of EXPECTED_TEST_FILES) {
    let source;
    try { source = await readFile(path.join(root, relativePath), 'utf8'); }
    catch (error) { fail('INVENTORY_DRIFT', `${relativePath}: ${error.message}`); }
    testFiles.push({ path: relativePath, topLevelDeclarations: (source.match(/^test\(/gm) || []).length });
  }
  const fixtureCases = {};
  for (const [name, relativePath] of Object.entries(FIXTURE_PATHS)) {
    const fixture = await readJson(root, relativePath);
    const cases = Array.isArray(fixture) ? fixture : fixture.cases;
    if (!Array.isArray(cases)) fail('INVENTORY_DRIFT', `${relativePath} has no case array`);
    fixtureCases[name] = cases.length;
  }
  return { testFiles, fixtureCases };
}

function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export async function validateReleaseManifest(manifest, root, { runtimeVersion = process.version } = {}) {
  assertClosedObject(manifest, TOP_LEVEL_KEYS, 'manifest');
  if (manifest.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA', 'manifest.schemaVersion');
  if (manifest.algorithm !== 'sha256') fail('INVALID_ALGORITHM', 'manifest.algorithm');
  if (typeof manifest.nodeVersion !== 'string' || !/^24\.\d+\.\d+$/.test(manifest.nodeVersion)) fail('INVALID_NODE_VERSION', 'manifest.nodeVersion');

  let nodeVersion;
  try { nodeVersion = (await readFile(path.join(root, NODE_VERSION_PATH), 'utf8')).trim(); }
  catch (error) { fail('NODE_VERSION_DRIFT', error.message); }
  if (nodeVersion !== manifest.nodeVersion) fail('NODE_VERSION_DRIFT', `${NODE_VERSION_PATH} does not match manifest`);
  if (runtimeVersion !== `v${manifest.nodeVersion}`) fail('RUNTIME_VERSION_DRIFT', `running ${runtimeVersion}; expected v${manifest.nodeVersion}`);

  if (!Array.isArray(manifest.frozenInputs) || manifest.frozenInputs.length !== EXPECTED_FROZEN_INPUTS.length) fail('FROZEN_INPUTS_CHANGED', 'frozenInputs must match the reviewed set');
  const seenRoles = new Set(); const seenPaths = new Set();
  for (let index = 0; index < manifest.frozenInputs.length; index += 1) {
    const input = manifest.frozenInputs[index];
    assertClosedObject(input, INPUT_KEYS, `frozenInputs[${index}]`);
    assertSafeRelativePath(input.path, `frozenInputs[${index}].path`);
    if (seenRoles.has(input.role) || seenPaths.has(input.path)) fail('DUPLICATE_INPUT', input.path);
    seenRoles.add(input.role); seenPaths.add(input.path);
    const [expectedRole, expectedPath] = EXPECTED_FROZEN_INPUTS[index];
    if (input.role !== expectedRole || input.path !== expectedPath) fail('FROZEN_INPUTS_CHANGED', `frozenInputs[${index}]`);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) fail('INVALID_DIGEST', input.path);
    if (await sha256File(root, input.path) !== input.sha256) fail('DIGEST_MISMATCH', input.path);
  }

  if (!Array.isArray(manifest.commands) || manifest.commands.length !== EXPECTED_COMMANDS.length) fail('COMMAND_DRIFT', 'command count');
  for (let index = 0; index < manifest.commands.length; index += 1) {
    const command = manifest.commands[index];
    assertClosedObject(command, COMMAND_KEYS, `commands[${index}]`);
    if (!sameJson(command, EXPECTED_COMMANDS[index])) fail('COMMAND_DRIFT', `commands[${index}]`);
    const scriptPath = command.argv[1]?.startsWith('--') ? command.argv[2] : command.argv[1];
    if (command.argv[0] === 'node' && typeof scriptPath === 'string' && scriptPath.endsWith('.mjs')) {
      await assertContainedRegularFile(root, scriptPath);
      assertTrackedFile(root, scriptPath);
    }
  }

  assertClosedObject(manifest.inventory, INVENTORY_KEYS, 'inventory');
  if (!Array.isArray(manifest.inventory.testFiles)) fail('INVALID_SCHEMA', 'inventory.testFiles');
  for (let index = 0; index < manifest.inventory.testFiles.length; index += 1) {
    assertClosedObject(manifest.inventory.testFiles[index], TEST_FILE_KEYS, `inventory.testFiles[${index}]`);
  }
  const actualInventory = await countInventory(root);
  if (!sameJson(manifest.inventory, actualInventory)) fail('INVENTORY_DRIFT', 'test declarations or fixture cases changed');

  return { ok: true, nodeVersion, frozenInputs: manifest.frozenInputs.length, commands: manifest.commands.length, inventory: actualInventory };
}

export async function validateWorkflow(root) {
  let workflow;
  try { workflow = await readFile(path.join(root, WORKFLOW_PATH), 'utf8'); }
  catch (error) { fail('WORKFLOW_INVALID', error.message); }
  let workflowFiles;
  try { workflowFiles = (await readdir(path.join(root, '.github/workflows'))).filter((name) => /\.ya?ml$/.test(name)).sort(); }
  catch (error) { fail('WORKFLOW_INVALID', error.message); }
  if (!sameJson(workflowFiles, ['ci.yml'])) fail('WORKFLOW_INVALID', 'the reviewed workflow set changed');
  if (workflow.replaceAll('\r\n', '\n') !== EXPECTED_WORKFLOW) fail('WORKFLOW_INVALID', `${WORKFLOW_PATH} differs from the reviewed read-only gate`);
  return { ok: true, nodeVersion: (await readFile(path.join(root, NODE_VERSION_PATH), 'utf8')).trim() };
}

export function runVerificationCommands(root, commands = EXPECTED_COMMANDS.map(({ argv }) => argv), spawn = spawnSync) {
  for (const argv of commands) {
    if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== 'string')) fail('COMMAND_FAILED', 'invalid argv');
    const [command, ...args] = argv;
    const result = spawn(command, args, { cwd: root, shell: false, stdio: 'inherit' });
    if (result.error) fail('COMMAND_FAILED', `${command}: ${result.error.message}`);
    if (result.status !== 0) fail('COMMAND_FAILED', `${argv.join(' ')} exited ${String(result.status)}${result.signal ? ` (${result.signal})` : ''}`);
  }
  return { ok: true, commands: commands.length };
}

export async function verifyRelease(root, { run = false } = {}) {
  const manifest = await loadReleaseManifest(root);
  const release = await validateReleaseManifest(manifest, root);
  await validateWorkflow(root);
  if (run) runVerificationCommands(root);
  return release;
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--run'].includes(args[0])) fail('USAGE', 'use --check or --run');
  const result = await verifyRelease(root, { run: args[0] === '--run' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}
