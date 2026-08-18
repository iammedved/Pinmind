#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = '0'.repeat(40);
const SAFE_EMAIL = /^(?:noreply@github\.com|[^@\s]+@users\.noreply\.github\.com|[^@\s]+@example\.invalid)$/i;
const GITHUB_MERGE_COMMITTER = /^noreply@github\.com$/i;
const GITHUB_WEB_FLOW_KEY = fileURLToPath(new URL('keys/github-web-flow.gpg', import.meta.url));
const GITHUB_WEB_FLOW_FINGERPRINTS = Object.freeze([
  '5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23',
  '968479A1AFF927E37D1A566BB5690EEEBB952194',
]);

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

function isTrustedProviderMerge(record) {
  return Array.isArray(record.parentShas)
    && record.parentShas.length === 2
    && record.parentShas.every((sha) => SHA.test(sha))
    && GITHUB_MERGE_COMMITTER.test(String(record.committerEmail || '').trim())
    && record.providerSignatureVerified === true;
}

function verifyGithubMergeSignature(root, sha, spawn = spawnSync) {
  const gpgHome = mkdtempSync(path.join(tmpdir(), 'pinmind-gpg-'));
  try {
    const common = { cwd: root, shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    spawn('gpg', ['--batch', '--homedir', gpgHome, '--import', GITHUB_WEB_FLOW_KEY], common);
    const verified = spawn('git', ['verify-commit', '--raw', sha], { ...common, env: { ...process.env, GNUPGHOME: gpgHome } });
    if (verified.status === null) fail('IDENTITY_CHECK_FAILED', 'provider signature verification could not run');
    if (verified.status !== 0) return false;
    const status = `${verified.stdout || ''}\n${verified.stderr || ''}`;
    return GITHUB_WEB_FLOW_FINGERPRINTS.some((fingerprint) => status.includes(`[GNUPG:] VALIDSIG ${fingerprint} `));
  } finally {
    rmSync(gpgHome, { recursive: true, force: true });
  }
}

export function validateIdentityRecords(records) {
  if (!Array.isArray(records) || records.length === 0) fail('IDENTITY_CHECK_FAILED', 'no identity records were available');
  for (const record of records) {
    const safeAuthor = isSafeReleaseEmail(record.authorEmail) || isTrustedProviderMerge(record);
    if (!SHA.test(record.sha || '') || !safeAuthor || !isSafeReleaseEmail(record.committerEmail)) {
      fail('UNSAFE_RELEASE_IDENTITY', SHA.test(record.sha || '') ? `commit ${record.sha} uses non-project-safe metadata` : 'invalid commit identity record');
    }
  }
  return records.length;
}

function parseConfiguredIdentity(value) {
  const match = /<([^<>]+)>/.exec(value);
  if (!match || !isSafeReleaseEmail(match[1])) fail('UNSAFE_RELEASE_IDENTITY', 'configured Git identity is not project-safe');
}

export function checkReleaseIdentity(root, { env = process.env, spawn = spawnSync, verifyProviderMerge = verifyGithubMergeSignature } = {}) {
  const base = env.PINMIND_DIFF_BASE_SHA; const head = env.PINMIND_DIFF_HEAD_SHA;
  if (!base && !head) {
    parseConfiguredIdentity(git(root, ['var', 'GIT_AUTHOR_IDENT'], spawn));
    parseConfiguredIdentity(git(root, ['var', 'GIT_COMMITTER_IDENT'], spawn));
    return { ok: true, mode: 'configured-identity', commits: 0 };
  }
  if (!SHA.test(base || '') || !SHA.test(head || '')) fail('INVALID_IDENTITY_RANGE', 'base and head must both be full lowercase commit SHAs');
  const start = base === ZERO_SHA ? `${head}^!` : `${git(root, ['merge-base', base, head], spawn)}..${head}`;
  const output = git(root, ['log', '--format=%H%x09%P%x09%ae%x09%ce', start, '--'], spawn);
  const records = output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, parents, authorEmail, committerEmail, ...extra] = line.split('\t');
    if (extra.length) fail('IDENTITY_CHECK_FAILED', 'invalid Git identity record');
    const parentShas = parents.split(' ').filter(Boolean);
    const providerSignatureVerified = parentShas.length === 2
      && GITHUB_MERGE_COMMITTER.test(String(committerEmail || '').trim())
      && !isSafeReleaseEmail(authorEmail)
      && verifyProviderMerge(root, sha, spawn);
    return { sha, parentShas, authorEmail, committerEmail, providerSignatureVerified };
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
