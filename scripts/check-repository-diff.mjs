#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = '0'.repeat(40);

export class RepositoryDiffError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = 'RepositoryDiffError'; this.code = code; }
}
function fail(code, detail) { throw new RepositoryDiffError(code, detail); }

function git(root, args, spawn = spawnSync) {
  const result = spawn('git', args, { cwd: root, shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) fail('DIFF_CHECK_FAILED', `${args.join(' ')}: ${result.stderr || result.error?.message || `exit ${result.status}`}`.trim());
  return result.stdout;
}

function inspectText(relativePath, content) {
  if (content.includes('\0')) return;
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (/[ \t]+$/.test(lines[index])) fail('DIFF_CHECK_FAILED', `${relativePath}:${index + 1}: trailing whitespace`);
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/.test(lines[index])) fail('DIFF_CHECK_FAILED', `${relativePath}:${index + 1}: conflict marker`);
  }
}

async function checkUntracked(root, spawn) {
  const output = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], spawn);
  for (const relativePath of output.split('\0').filter(Boolean)) {
    const candidate = path.join(root, relativePath); const metadata = await lstat(candidate);
    if (!metadata.isFile()) continue;
    if (metadata.size > 2 * 1024 * 1024) fail('DIFF_CHECK_FAILED', `${relativePath}: untracked file exceeds the 2 MiB inspection limit`);
    inspectText(relativePath, await readFile(candidate, 'utf8'));
  }
}

export async function checkRepositoryDiff(root, { env = process.env, spawn = spawnSync } = {}) {
  const base = env.PINMIND_DIFF_BASE_SHA; const head = env.PINMIND_DIFF_HEAD_SHA;
  if (base || head) {
    if (!SHA.test(base || '') || !SHA.test(head || '')) fail('INVALID_DIFF_RANGE', 'base and head must both be full lowercase commit SHAs');
    if (base === ZERO_SHA) {
      const emptyTree = git(root, ['hash-object', '-t', 'tree', '--stdin'], spawn).trim();
      if (!SHA.test(emptyTree)) fail('INVALID_DIFF_RANGE', 'git hash-object did not return one empty-tree SHA');
      git(root, ['diff', '--check', emptyTree, head, '--'], spawn);
    }
    else {
      const mergeBase = git(root, ['merge-base', base, head], spawn).trim();
      if (!SHA.test(mergeBase)) fail('INVALID_DIFF_RANGE', 'git merge-base did not return one commit SHA');
      git(root, ['diff', '--check', mergeBase, head, '--'], spawn);
    }
    return { ok: true, mode: 'commit-range', base, head };
  }
  git(root, ['diff', '--check', 'HEAD', '--'], spawn);
  await checkUntracked(root, spawn);
  return { ok: true, mode: 'working-tree' };
}

async function main() {
  if (process.argv.length !== 2) fail('USAGE', 'no arguments are accepted');
  const root = fileURLToPath(new URL('..', import.meta.url));
  process.stdout.write(`${JSON.stringify(await checkRepositoryDiff(root), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}
