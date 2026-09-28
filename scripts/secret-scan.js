#!/usr/bin/env node
/**
 * Zero-dependency secret scanner.
 *
 * Runs on the pre-commit hook and in CI with nothing to install — it uses only
 * node:fs, so it behaves identically everywhere (no git subprocess, no extra
 * package, no platform binary).
 *
 * IMPORTANT: this is a safety net, not the primary defence. Order of strength:
 *   1. GitHub Push Protection — blocks the push server-side (enable in repo settings)
 *   2. short-lived, minimally-scoped fine-grained PATs; `GITHUB_TOKEN` in CI
 *   3. this scanner — catches things before they enter a commit
 *
 * Usage
 *   node scripts/secret-scan.mjs            # scan the working tree (default)
 *   node scripts/secret-scan.mjs --quiet    # only print on failure
 *
 * To silence a genuine false positive, append `secret-scan:ignore` to that line.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const IGNORE_MARKER = 'secret-scan:ignore';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Always skipped, whether or not .gitignore lists them. */
const ALWAYS_SKIP = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  'coverage',
  '.workbuddy',
  '.husky',
  '.pnpm-store',
]);

const SKIP_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);

const SKIP_EXT =
  /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|zip|gz|tgz|rar|7z|map|wasm|exe|dll|so|dylib)$/i;

/** Placeholders that look like secrets but are not. */
const PLACEHOLDER =
  /^(?:x{3,}|\*{3,}|your[-_]?\w*|example|placeholder|changeme|dummy|test|foo|bar|todo|none|null|undefined|\$\{[^}]+\}|process\.env\..*|<[^>]+>)$/i;

const RULES = [
  {
    id: 'github-fine-grained-pat',
    desc: 'GitHub fine-grained PAT',
    re: /github_pat_[A-Za-z0-9_]{22,}/g,
  },
  {
    id: 'github-classic-token',
    desc: 'GitHub classic token (ghp/gho/ghu/ghs/ghr)',
    re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
  },
  { id: 'aws-access-key-id', desc: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'slack-token', desc: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'npm-token', desc: 'npm access token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  {
    id: 'private-key',
    desc: 'private key block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  { id: 'telegram-bot-token', desc: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { id: 'google-api-key', desc: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    // `token: "..."`, `PASSWORD=...`, `apiKey = "..."` style assignments.
    id: 'assigned-credential',
    desc: 'credential-looking literal assigned to a secret-ish name',
    re: /(?:secret|token|password|passwd|pwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)["' ]{0,2}\s*[:=]\s*["']([A-Za-z0-9+/=_-]{20,})["']/gi,
    captureGroup: 1,
  },
];

/** Minimal .gitignore support: enough to skip node_modules/build/.env etc. */
function loadGitignorePatterns() {
  const patterns = [];
  const file = join(ROOT, '.gitignore');
  if (!existsSync(file)) return patterns;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    patterns.push(line.replace(/\/$/, ''));
  }
  return patterns;
}

function gitignoreMatchers() {
  return loadGitignorePatterns().map((p) => {
    const escaped = p
      .split(/[\\/]/)
      .map((seg) =>
        seg
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*'),
      )
      .join('[/\\\\]');
    return new RegExp(`(^|[/\\\\])${escaped}([/\\\\]|$)`);
  });
}

const IGNORE_MATCHERS = gitignoreMatchers();

function isIgnored(relPath) {
  return IGNORE_MATCHERS.some((re) => re.test(relPath));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (entry.isDirectory()) {
      if (ALWAYS_SKIP.has(entry.name)) continue;
      if (isIgnored(rel)) continue;
      walk(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name) || SKIP_EXT.test(entry.name)) continue;
    if (isIgnored(rel)) continue;
    out.push({ abs, rel });
  }
}

function scanText(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(IGNORE_MARKER)) return;
    for (const rule of RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      const match = re.exec(line);
      if (!match) continue;
      const value = rule.captureGroup ? match[rule.captureGroup] : match[0];
      if (PLACEHOLDER.test(value)) continue;
      hits.push({ line: index + 1, rule, value });
    }
  });
  return hits;
}

function mask(value) {
  const v = String(value);
  return v.length <= 12 ? `${v.slice(0, 4)}***` : `${v.slice(0, 8)}***${v.slice(-4)}`;
}

const files = [];
walk(ROOT, files);

const findings = [];
let checked = 0;
for (const file of files) {
  let size;
  try {
    size = statSync(file.abs).size;
  } catch {
    continue;
  }
  if (size > MAX_FILE_BYTES) continue;
  const buf = readFileSync(file.abs);
  if (buf.includes(0)) continue; // binary
  const text = buf.toString('utf8');
  if (text.includes('￿')) continue; // replacement char => not valid text
  checked += 1;
  for (const hit of scanText(text)) findings.push({ path: file.rel, ...hit });
}

const quiet = process.argv.includes('--quiet');

if (findings.length > 0) {
  console.error('\nSecret scan FAILED — refusing to continue.\n');
  for (const f of findings) {
    console.error(`  ${f.path}:${f.line}  [${f.rule.id}] ${f.rule.desc}`);
    console.error(`      ${mask(f.value)}`);
  }
  console.error(
    `\n${findings.length} finding(s). False positive? Append \`${IGNORE_MARKER}\` to that line.\n` +
      'Real credential? REVOKE/ROTATE IT FIRST — deleting the commit does not un-leak it.\n',
  );
  process.exit(1);
}

if (!quiet) console.log(`Secret scan clean (${checked} file(s) checked).`);
