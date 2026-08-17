#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_PACKAGE_SEGMENTS = new Set(['.git', '.pinmind']);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} exited ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout || '';
}

function normalizeRelative(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) {
    throw new Error('Release package contains an invalid empty or NUL path.');
  }
  const normalized = candidate.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Release package path escapes its root: ${candidate}`);
  }
  return normalized;
}

export function assertSafePackagePaths(relativePaths) {
  for (const candidate of relativePaths) {
    const normalized = normalizeRelative(candidate);
    const forbidden = normalized.split('/').find((segment) => FORBIDDEN_PACKAGE_SEGMENTS.has(segment));
    if (forbidden) throw new Error(`Forbidden runtime/private path in release package: ${normalized}`);
  }
}

export async function withInstallLock(lockPath, action) {
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Another Pinmind release installation owns ${lockPath}; recover stale locks manually.`);
    }
    throw error;
  }
  try {
    return await action();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function swapMarketplaceSource({ marketplaceSource, staged, backup, failed, installAndVerify }) {
  let previousMoved = false;
  let stagedMoved = false;
  try {
    try {
      await rename(marketplaceSource, backup);
      previousMoved = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await rename(staged, marketplaceSource);
    stagedMoved = true;
    await installAndVerify();
  } catch (originalError) {
    const rollbackErrors = [];
    if (stagedMoved) {
      try {
        await rename(marketplaceSource, failed);
      } catch (error) {
        rollbackErrors.push(`could not quarantine failed source: ${error.message}`);
      }
    }
    if (previousMoved) {
      try {
        await rename(backup, marketplaceSource);
      } catch (error) {
        rollbackErrors.push(`could not restore previous source from ${backup}: ${error.message}`);
      }
    }
    try {
      await rm(failed, { recursive: true, force: true });
    } catch (error) {
      rollbackErrors.push(`could not remove quarantined source ${failed}: ${error.message}`);
    }
    if (rollbackErrors.length > 0) {
      throw new Error(`Release installation failed (${originalError.message}); rollback is incomplete: ${rollbackErrors.join('; ')}`, { cause: originalError });
    }
    throw originalError;
  }
  if (previousMoved) await rm(backup, { recursive: true, force: true });
}

async function trackedFiles(repoRoot) {
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot }).trim();
  if (status) throw new Error(`Refusing to package a dirty worktree:\n${status}`);
  const output = run('git', ['ls-files', '-z'], { cwd: repoRoot });
  const files = output.split('\0').filter(Boolean).map(normalizeRelative);
  assertSafePackagePaths(files);
  return files;
}

async function copyTrackedTree(repoRoot, destination, files) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const relative of files) {
    const source = path.join(repoRoot, relative);
    const target = path.join(destination, relative);
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile()) {
      throw new Error(`Tracked release entry is not a regular file: ${relative}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, sourceStat.mode & 0o777);
  }
}

async function walkFiles(root, relative = '') {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walkFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Installed package contains a non-regular entry: ${child}`);
  }
  return files.sort();
}

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function assertTreesEqual(expectedRoot, actualRoot, expectedFiles) {
  const actualFiles = await walkFiles(actualRoot);
  assertSafePackagePaths(actualFiles);
  const sortedExpected = [...expectedFiles].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(sortedExpected)) {
    throw new Error('Installed cache file set differs from the tracked release package.');
  }
  for (const relative of sortedExpected) {
    const expectedHash = await digest(path.join(expectedRoot, relative));
    const actualHash = await digest(path.join(actualRoot, relative));
    if (expectedHash !== actualHash) throw new Error(`Installed cache differs at ${relative}`);
  }
}

async function validateMarketplace(marketplacePath, pluginName) {
  const marketplace = JSON.parse(await readFile(marketplacePath, 'utf8'));
  if (marketplace.name !== 'personal') throw new Error('Expected the personal marketplace.');
  const entry = marketplace.plugins?.find((candidate) => candidate?.name === pluginName);
  if (entry?.source?.source !== 'local' || entry.source.path !== `./plugins/${pluginName}`) {
    throw new Error(`Personal marketplace must point ${pluginName} at ./plugins/${pluginName}.`);
  }
}

async function validateExistingSource(sourcePath, repoRoot, pluginName) {
  try {
    const sourceStat = await lstat(sourcePath);
    if (sourceStat.isSymbolicLink()) {
      const resolved = await realpath(sourcePath);
      if (resolved !== repoRoot) throw new Error(`Unexpected marketplace symlink target: ${resolved}`);
      return;
    }
    if (!sourceStat.isDirectory()) throw new Error(`Marketplace source is not a directory: ${sourcePath}`);
    const manifest = JSON.parse(await readFile(path.join(sourcePath, '.codex-plugin/plugin.json'), 'utf8'));
    if (manifest.name !== pluginName) throw new Error(`Marketplace source contains ${manifest.name}, not ${pluginName}.`);
    const existingFiles = await walkFiles(sourcePath);
    assertSafePackagePaths(existingFiles);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/install-personal-release.mjs');
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = await realpath(path.resolve(path.dirname(scriptPath), '..'));
  const manifest = JSON.parse(await readFile(path.join(repoRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const pluginName = manifest.name;
  const releaseFiles = await trackedFiles(repoRoot);
  for (const relative of ['.codex-plugin/plugin.json', 'skills/pinmind/SKILL.md']) {
    if (!releaseFiles.includes(relative)) throw new Error(`Missing required tracked release file: ${relative}`);
  }

  const userHome = homedir();
  const marketplacePath = path.join(userHome, '.agents', 'plugins', 'marketplace.json');
  const marketplaceSource = path.join(userHome, 'plugins', pluginName);
  const marketplaceParent = path.dirname(marketplaceSource);
  const installLock = path.join(marketplaceParent, `.${pluginName}-install.lock`);
  const codexHomePath = process.env.CODEX_HOME || path.join(userHome, '.codex');
  const installedRoot = path.join(codexHomePath, 'plugins', 'cache', 'personal', pluginName, manifest.version);
  await validateMarketplace(marketplacePath, pluginName);

  await mkdir(marketplaceParent, { recursive: true });
  const staged = await mkdtemp(path.join(marketplaceParent, `.${pluginName}-release-`));
  const uniqueSuffix = path.basename(staged);
  const backup = path.join(marketplaceParent, `.${pluginName}-previous-${uniqueSuffix}`);
  const failed = path.join(marketplaceParent, `.${pluginName}-failed-${uniqueSuffix}`);
  try {
    await copyTrackedTree(repoRoot, staged, releaseFiles);
    await assertTreesEqual(staged, staged, releaseFiles);
    await withInstallLock(installLock, async () => {
      await validateExistingSource(marketplaceSource, repoRoot, pluginName);
      await swapMarketplaceSource({
        marketplaceSource,
        staged,
        backup,
        failed,
        installAndVerify: async () => {
          run('codex', ['plugin', 'add', `${pluginName}@personal`, '--json'], { inherit: true });
          await assertTreesEqual(marketplaceSource, installedRoot, releaseFiles);
          const installedVersions = await readdir(path.dirname(installedRoot), { withFileTypes: true });
          for (const version of installedVersions.filter((entry) => entry.isDirectory())) {
            const versionFiles = await walkFiles(path.join(path.dirname(installedRoot), version.name));
            assertSafePackagePaths(versionFiles);
          }
        },
      });
    });
  } finally {
    await rm(staged, { recursive: true, force: true });
  }

  process.stdout.write(`Installed ${pluginName}@personal ${manifest.version} from ${releaseFiles.length} tracked files; cache is byte-identical and contains no .git or .pinmind paths.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
