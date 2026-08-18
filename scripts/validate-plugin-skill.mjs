#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_KEYS = new Set(['name', 'version', 'description', 'author', 'license', 'keywords', 'skills', 'interface']);
const AUTHOR_KEYS = new Set(['name']);
const INTERFACE_KEYS = new Set(['displayName', 'composerIcon', 'logo', 'shortDescription', 'longDescription', 'developerName', 'category', 'capabilities', 'defaultPrompt']);
const SKILL_FRONTMATTER_KEYS = new Set(['name', 'description']);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PluginValidationError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = 'PluginValidationError'; this.code = code; }
}
function fail(code, detail) { throw new PluginValidationError(code, detail); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function closed(value, keys, label) {
  if (!isObject(value)) fail('INVALID_PLUGIN', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail('INVALID_PLUGIN', `${label}.${key} is not allowed`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('INVALID_PLUGIN', `${label}.${key} is required`);
}
function string(value, label, max = 1024) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_PLUGIN', label); }
async function regularFile(root, relativePath) {
  const physicalRoot = await realpath(root); let cursor = root;
  for (const [index, segment] of relativePath.split('/').entries()) {
    cursor = path.join(cursor, segment); let metadata;
    try { metadata = await lstat(cursor); } catch (error) { fail('INVALID_PATH', `${relativePath}: ${error.message}`); }
    if (metadata.isSymbolicLink()) fail('INVALID_PATH', `${relativePath} contains a symbolic link`);
    if (index < relativePath.split('/').length - 1 && !metadata.isDirectory()) fail('INVALID_PATH', `${relativePath} has a non-directory parent`);
    if (index === relativePath.split('/').length - 1 && !metadata.isFile()) fail('INVALID_PATH', `${relativePath} is not a regular file`);
  }
  const physicalFile = await realpath(cursor);
  if (!physicalFile.startsWith(`${physicalRoot}${path.sep}`)) fail('INVALID_PATH', `${relativePath} escapes the repository`);
  return physicalFile;
}
async function json(root, relativePath) { try { return JSON.parse(await readFile(await regularFile(root, relativePath), 'utf8')); } catch (error) { if (error instanceof PluginValidationError) throw error; fail('INVALID_JSON', `${relativePath}: ${error.message}`); } }

function parseFrontmatter(source, relativePath) {
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) fail('INVALID_SKILL', `${relativePath} has no YAML frontmatter`);
  const result = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!field) fail('INVALID_SKILL', `${relativePath} has unsupported frontmatter syntax`);
    const [, key, raw] = field;
    if (!SKILL_FRONTMATTER_KEYS.has(key)) fail('INVALID_SKILL', `${relativePath}.${key} is not allowed`);
    if (Object.hasOwn(result, key)) fail('INVALID_SKILL', `${relativePath}.${key} is repeated`);
    let value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value.replace(/\\"/g, '"');
  }
  for (const key of SKILL_FRONTMATTER_KEYS) if (!Object.hasOwn(result, key)) fail('INVALID_SKILL', `${relativePath}.${key} is required`);
  return result;
}

export async function validatePluginAndSkills(root) {
  const plugin = await json(root, '.codex-plugin/plugin.json');
  closed(plugin, PLUGIN_KEYS, 'plugin'); closed(plugin.author, AUTHOR_KEYS, 'plugin.author'); closed(plugin.interface, INTERFACE_KEYS, 'plugin.interface');
  if (!NAME.test(plugin.name)) fail('INVALID_PLUGIN', 'plugin.name');
  if (!SEMVER.test(plugin.version)) fail('INVALID_PLUGIN', 'plugin.version');
  string(plugin.description, 'plugin.description', 256); string(plugin.author.name, 'plugin.author.name', 80); string(plugin.license, 'plugin.license', 32);
  if (plugin.skills !== './skills/') fail('INVALID_PLUGIN', 'plugin.skills must be ./skills/');
  if (!Array.isArray(plugin.keywords) || plugin.keywords.length === 0 || plugin.keywords.some((item) => typeof item !== 'string' || !item.trim())) fail('INVALID_PLUGIN', 'plugin.keywords');
  string(plugin.interface.displayName, 'plugin.interface.displayName', 48); string(plugin.interface.shortDescription, 'plugin.interface.shortDescription', 80);
  string(plugin.interface.longDescription, 'plugin.interface.longDescription', 2048); string(plugin.interface.developerName, 'plugin.interface.developerName', 80);
  string(plugin.interface.category, 'plugin.interface.category', 48);
  for (const key of ['composerIcon', 'logo']) {
    string(plugin.interface[key], `plugin.interface.${key}`, 256);
    if (!plugin.interface[key].startsWith('./')) fail('INVALID_PLUGIN', `plugin.interface.${key} must start with ./`);
    const relativePath = plugin.interface[key].slice(2);
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) fail('INVALID_PATH', `plugin.interface.${key}`);
    await regularFile(root, relativePath);
  }
  for (const key of ['capabilities', 'defaultPrompt']) if (!Array.isArray(plugin.interface[key]) || plugin.interface[key].length === 0 || plugin.interface[key].some((item) => typeof item !== 'string' || !item.trim())) fail('INVALID_PLUGIN', `plugin.interface.${key}`);

  const skillsDir = path.join(root, 'skills');
  const entries = (await readdir(skillsDir)).sort(); const skills = [];
  for (const entry of entries) {
    const entryMetadata = await lstat(path.join(skillsDir, entry));
    if (entryMetadata.isSymbolicLink()) fail('INVALID_PATH', `skills/${entry} is a symbolic link`);
    if (!entryMetadata.isDirectory()) continue;
    if (!NAME.test(entry)) fail('INVALID_SKILL', `${entry} is not hyphen-case`);
    const relativePath = `skills/${entry}/SKILL.md`; let source;
    try { source = await readFile(await regularFile(root, relativePath), 'utf8'); } catch (error) { if (error instanceof PluginValidationError) throw error; fail('INVALID_SKILL', `${relativePath}: ${error.message}`); }
    const metadata = parseFrontmatter(source, relativePath);
    if (metadata.name !== entry) fail('INVALID_SKILL', `${relativePath}.name must match its directory`);
    if (!NAME.test(metadata.name) || metadata.name.length > 64) fail('INVALID_SKILL', `${relativePath}.name`);
    string(metadata.description, `${relativePath}.description`, 1024);
    if (/\b(?:TODO|TBD)\b/.test(source)) fail('INVALID_SKILL', `${relativePath} contains unfinished markers`);
    skills.push(entry);
  }
  if (skills.length === 0) fail('INVALID_SKILL', 'no skills found');

  const marketplace = await json(root, '.agents/plugins/marketplace.json');
  if (marketplace.name !== 'pinmind-project' || !Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) fail('INVALID_MARKETPLACE', 'unexpected marketplace shape');
  const listing = marketplace.plugins[0];
  if (listing.name !== plugin.name || listing.source?.source !== 'local' || listing.source?.path !== './' || listing.policy?.installation !== 'AVAILABLE') fail('INVALID_MARKETPLACE', 'plugin listing is incoherent');
  return { ok: true, plugin: plugin.name, version: plugin.version, skills };
}

async function main() {
  if (process.argv.length !== 2) fail('USAGE', 'no arguments are accepted');
  const root = fileURLToPath(new URL('..', import.meta.url));
  process.stdout.write(`${JSON.stringify(await validatePluginAndSkills(root), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}
