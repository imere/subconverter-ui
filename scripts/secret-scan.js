#!/usr/bin/env node
/**
 * Zero-dependency secret scanner — the FALLBACK for machines without gitleaks.
 *
 * `gitleaks` (150+ rules, see .gitleaks.toml) is the primary scanner. This
 * script exists so a machine that has not installed gitleaks is never bare:
 * it uses only node:fs + git, so it runs identically everywhere with nothing
 * to install.
 *
 * IMPORTANT: this is a safety net, not the primary defence. Order of strength:
 *   1. GitHub Push Protection — blocks the push server-side (needs a public
 *      repo or a Secret Protection SKU; this repo is private, so unavailable)
 *   2. gitleaks — 150+ rules, run in the pre-commit / pre-push hooks and CI
 *   3. this scanner — fewer rules, but zero install
 *
 * A client-side hook can always be skipped with `--no-verify`. The only layers
 * that cannot be skipped are CI and server-side push protection — and CI runs
 * AFTER the commit exists, i.e. after the leak. So the local hooks are the
 * only thing that can keep a credential out of history entirely.
 *
 * Usage
 *   node scripts/secret-scan.js                # scan the working tree (default)
 *   git diff --cached -U0 | node scripts/secret-scan.js --patch
 *   git log -p --not --remotes -U0 | node scripts/secret-scan.js --patch
 *   node scripts/secret-scan.js --quiet        # only print on failure
 *
 * Why `--patch` reads stdin instead of calling git itself: spawning `git` from
 * node is not reliable everywhere (on some Windows sandboxes spawnSync fails
 * with EBUSY), and the shell that runs the hook can call git perfectly well.
 * So the hook pipes a unified diff in and this script stays process-free.
 *
 * To silence a genuine false positive, append `secret-scan:ignore` to that line.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const IGNORE_MARKER = 'secret-scan:ignore';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Entropy floor for the catch-all rule. Tuned against this repo: 4.3 bits/char
 *  catches base64/hex keys while letting ordinary identifiers through. */
const ENTROPY_MIN = 4.3;
const ENTROPY_MIN_LEN = 24;

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

// Scanner configs hold credential-shaped regexes by definition; scanning them
// only produces self-inflicted false positives. Also skipped: lockfiles, which
// are enormous and contain integrity hashes rather than secrets.
const SKIP_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.gitleaks.toml',
  'gitleaks.toml',
]);

const SKIP_EXT =
  /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|zip|gz|tgz|rar|7z|map|wasm|exe|dll|so|dylib)$/i;

/** Placeholders that look like secrets but are not. */
const PLACEHOLDER =
  /^(?:x{3,}|\*{3,}|your[-_]?\w*|example|placeholder|changeme|dummy|test|foo|bar|todo|none|null|undefined|\$\{[^}]+\}|\{\{.*\}\}|<[^>]+>|process\.env\..*|import\.meta\..*)$/i;

const SECRETISH_NAME =
  '(?:secret|token|password|passwd|pwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|credential|auth)';

const RULES = [
  // --- GitHub (this repo's real credential surface) -------------------------
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

  // --- Cloud / infra --------------------------------------------------------
  { id: 'aws-access-key-id', desc: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'google-api-key', desc: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    id: 'google-oauth-id',
    desc: 'Google OAuth client id',
    re: /\b\d{12}-[a-z0-9]{32}\.apps\.googleusercontent\.com\b/g,
  },

  // --- SaaS providers -------------------------------------------------------
  {
    id: 'stripe-access-token',
    desc: 'Stripe key',
    re: /\b(?:sk|rk)_(?:test|live|prod)_[A-Za-z0-9]{10,99}\b/g,
  },
  {
    id: 'openai-api-key',
    desc: 'OpenAI key',
    re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g,
  },
  { id: 'anthropic-api-key', desc: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  {
    id: 'sendgrid-api-token',
    desc: 'SendGrid key',
    re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
  },
  { id: 'gitlab-pat', desc: 'GitLab PAT', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-token', desc: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    id: 'slack-webhook',
    desc: 'Slack webhook URL',
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_/]{20,}/g,
  },
  { id: 'twilio-key', desc: 'Twilio account/sk key', re: /\b(?:AC|SK)[0-9a-fA-F]{32}\b/g },
  { id: 'npm-token', desc: 'npm access token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'telegram-bot-token', desc: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  {
    id: 'jwt',
    desc: 'JSON Web Token',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'private-key',
    desc: 'private key block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
  },

  // --- Credentials embedded in URIs ----------------------------------------
  // A Postgres/MySQL/Redis URI whose userinfo carries "user:password@host".
  // Missed by every provider-specific rule, because the credential is a URI
  // component rather than a token with a recognisable prefix.
  //
  // NOTE: keep examples in comments free of anything credential-shaped — the
  // scanners (including this one) will flag this file otherwise.
  {
    id: 'uri-credential',
    desc: 'username:password embedded in a connection URI',
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|ftp|https?):\/\/[^\s:/@]{1,64}:([^\s:@/]{3,})@/gi,
    captureGroup: 1,
  },
  {
    id: 'jdbc-credential',
    desc: 'password in a JDBC URL',
    re: /jdbc:[a-z0-9]+:[^\s]*?password=([^\s;&"']{3,})/gi,
    captureGroup: 1,
  },

  // --- Generic assignment ---------------------------------------------------
  // `token: "..."`, `PASSWORD=...`, `apiKey = '...'` — quoted AND unquoted.
  // The old version required quotes, which is why plain YAML/env style
  // assignments slipped through entirely.
  {
    id: 'assigned-credential',
    desc: 'credential-looking literal assigned to a secret-ish name',
    re: new RegExp(
      SECRETISH_NAME +
        `["' ]{0,2}\\s*[:=]\\s*(?:"([^"\\s]{6,})"|'([^'\\s]{6,})'|([A-Za-z0-9+/=_-]{10,}))`,
      'gi',
    ),
    pickFirstDefined: true,
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

function isSkippedPath(relPath) {
  const base = relPath.split('/').pop() || relPath;
  return SKIP_FILES.has(base) || SKIP_EXT.test(base) || isIgnored(relPath);
}

function shannon(s) {
  const freq = new Map();
  for (const c of s) freq.set(c, (freq.get(c) || 0) + 1);
  let e = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

/** True when the token is obviously not a secret (a hash, an id, a word...). */
function isBenignToken(t) {
  if (/^(.)\1+$/.test(t)) return true; // aaaaaaaa
  if (/^\d+$/.test(t)) return true; // long numeric id / timestamp
  if (/^[a-z]+$/.test(t)) return true; // a single lowercase word
  // Fixed-width hex digests are content hashes far more often than secrets.
  if (/^[0-9a-f]+$/.test(t) && (t.length === 32 || t.length === 40 || t.length === 64)) return true;
  if (PLACEHOLDER.test(t)) return true;
  return false;
}

function scanText(text, loc) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(IGNORE_MARKER)) return;
    const at = { ...loc, line: index + 1 };

    for (const rule of RULES) {
      // Fresh RegExp per line: `g` state must not carry over between lines.
      const re = new RegExp(rule.re.source, rule.re.flags);
      for (const match of line.matchAll(re)) {
        let value;
        if (rule.pickFirstDefined) value = match.slice(1).find((g) => g !== undefined);
        else if (rule.captureGroup) value = match[rule.captureGroup];
        else value = match[0];
        if (!value) continue;
        if (PLACEHOLDER.test(value)) continue;
        hits.push({ ...at, rule, value });
      }
    }

    // Catch-all: a long, high-entropy token that no named rule recognises.
    // This is what catches internal/self-issued formats nobody writes a rule
    // for — at the cost of some false positives, hence the tuned floor.
    for (const token of line.split(/[^A-Za-z0-9+/=_-]+/)) {
      if (token.length < ENTROPY_MIN_LEN) continue;
      if (isBenignToken(token)) continue;
      if (shannon(token) < ENTROPY_MIN) continue;
      hits.push({
        ...at,
        rule: { id: 'high-entropy-token', desc: 'long high-entropy token (unknown format)' },
        value: token,
      });
    }
  });
  return hits;
}

function mask(value) {
  const v = String(value);
  return v.length <= 12 ? `${v.slice(0, 4)}***` : `${v.slice(0, 8)}***${v.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Target collection: two modes, because a scanner that only ever reads the
// working tree misses what git is ACTUALLY going to record.
// ---------------------------------------------------------------------------

/** Walk the working tree (default mode). */
function collectTree() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(ROOT, abs).split(sep).join('/');
      if (entry.isDirectory()) {
        if (ALWAYS_SKIP.has(entry.name) || isIgnored(rel)) continue;
        walk(abs);
        continue;
      }
      if (!entry.isFile() || isSkippedPath(rel)) continue;
      out.push({ abs, rel });
    }
  };
  walk(ROOT);
  const targets = [];
  for (const f of out) {
    let size;
    try {
      size = statSync(f.abs).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES) continue;
    const buf = readFileSync(f.abs);
    if (buf.includes(0)) continue; // binary
    const text = buf.toString('utf8');
    if (text.includes('￿')) continue; // replacement char => not valid text
    targets.push({ text, loc: { path: f.rel } });
  }
  return targets;
}

/**
 * Read a unified diff from stdin and scan every ADDED line only.
 *
 * Used for both gates, with a different producer:
 *   pre-commit : git diff --cached -U0          (what the commit will record)
 *   pre-push   : git log -p --not --remotes -U0 (what the push will send)
 *
 * Scanning only added lines is deliberate: a line you did not write cannot be
 * your leak, and it keeps the noise down.
 */
function collectPatch() {
  const patch = readFileSync(0, 'utf8');
  const chunks = new Map(); // path -> { commit, lines[] }
  let commit = '';
  let path = '';
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('commit ')) commit = raw.slice(7).trim().slice(0, 8);
    else if (raw.startsWith('+++ ')) path = raw.slice(4).trim().replace(/^b\//, '');
    else if (raw.startsWith('-'))
      continue; // removed line: cannot leak
    else if (raw.startsWith('+')) {
      if (!path || path === '/dev/null' || isSkippedPath(path)) continue;
      if (!chunks.has(path)) chunks.set(path, { commit, lines: [] });
      chunks.get(path).lines.push(raw.slice(1));
    }
  }
  const targets = [];
  for (const [p, { commit: c, lines }] of chunks) {
    targets.push({ text: lines.join('\n'), loc: { path: p, commit: c } });
  }
  // An empty diff is usually "nothing to scan", but it is also exactly what a
  // broken revision expression produces — and that failure mode is silent.
  // Say so out loud so it can never be mistaken for a clean result.
  const sawCommitMarker = /^commit /m.test(patch);
  if (targets.length === 0 && !sawCommitMarker && patch.trim() !== '') {
    console.error('secret-scan: diff had no added lines — nothing was actually checked.');
  }
  return targets;
}

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const mode = argv.includes('--patch') ? 'patch' : 'tree';
const quiet = argv.includes('--quiet');

const targets = mode === 'patch' ? collectPatch() : collectTree();

const findings = [];
for (const t of targets) {
  for (const hit of scanText(t.text, t.loc)) findings.push(hit);
}

if (findings.length > 0) {
  console.error('\nSecret scan FAILED — refusing to continue.\n');
  for (const f of findings) {
    const where = f.commit ? `${f.commit}  ${f.path}` : `${f.path}:${f.line}`;
    console.error(`  ${where}  [${f.rule.id}] ${f.rule.desc}`);
    console.error(`      ${mask(f.value)}`);
  }
  console.error(
    `\n${findings.length} finding(s) in ${mode} mode. False positive? Append \`${IGNORE_MARKER}\` to that line.\n` +
      'Real credential? REVOKE/ROTATE IT FIRST — deleting the commit does not un-leak it.\n',
  );
  process.exit(1);
}

if (!quiet) console.log(`Secret scan clean (${mode} mode, ${targets.length} target(s)).`);
