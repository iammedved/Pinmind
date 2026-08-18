#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = '0'.repeat(40);
const SAFE_EMAIL = /^(?:noreply@github\.com|[^@\s]+@users\.noreply\.github\.com|[^@\s]+@example\.invalid)$/i;

export class ReleaseIdentityError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = 'ReleaseIdentityError'; this.code = code; }
}

function fail(code, detail) { throw new ReleaseIdentityError(code, detail); }

function git(root, args, spawn = spawnSync) {
  const result = spawn('git', args, { cwd: root, shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) fail('IDENTITY_CHECK_FAILED', `${args[0]} failed`);
  return result.stdout.trim();
}

export function isSafeReleaseEmail(email) { return SAFE_EMAIL.test(String(email || '').trim()); }

export function validateIdentityRecords(records) {
  if (!Array.isArray(records) || records.length === 0) fail('IDENTITY_CHECK_FAILED', 'no identity records were available');
  for (const record of records) {
    if (!SHA.test(record.sha || '') || !isSafeReleaseEmail(record.authorEmail) || !isSafeReleaseEmail(record.committerEmail)) {
      fail('UNSAFE_RELEASE_IDENTITY', SHA.test(record.sha || '') ? `commit ${record.sha} uses non-project-safe metadata` : 'invalid commit identity record');
    }
  }
  return records.length;
}

function parseConfiguredIdentity(value) {
  const match = /<([^<>]+)>/.exec(value);
  if (!match || !isSafeReleaseEmail(match[1])) fail('UNSAFE_RELEASE_IDENTITY', 'configured Git identity is not project-safe');
}

export function checkReleaseIdentity(root, { env = process.env, spawn = spawnSync } = {}) {
  const base = env.PINMIND_DIFF_BASE_SHA; const head = env.PINMIND_DIFF_HEAD_SHA;
  if (!base && !head) {
    parseConfiguredIdentity(git(root, ['var', 'GIT_AUTHOR_IDENT'], spawn));
    parseConfiguredIdentity(git(root, ['var', 'GIT_COMMITTER_IDENT'], spawn));
    return { ok: true, mode: 'configured-identity', commits: 0 };
  }
  if (!SHA.test(base || '') || !SHA.test(head || '')) fail('INVALID_IDENTITY_RANGE', 'base and head must both be full lowercase commit SHAs');
  const start = base === ZERO_SHA ? `${head}^!` : `${git(root, ['merge-base', base, head], spawn)}..${head}`;
  const output = git(root, ['log', '--format=%H%x09%ae%x09%ce', start, '--'], spawn);
  const records = output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, authorEmail, committerEmail, ...extra] = line.split('\t');
    if (extra.length) fail('IDENTITY_CHECK_FAILED', 'invalid Git identity record');
    return { sha, authorEmail, committerEmail };
  });
  return { ok: true, mode: 'commit-range', base, head, commits: validateIdentityRecords(records) };
}

async function main() {
  if (process.argv.length !== 2) fail('USAGE', 'no arguments are accepted');
  const root = fileURLToPath(new URL('..', import.meta.url));
  process.stdout.write(`${JSON.stringify(checkReleaseIdentity(root), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}
