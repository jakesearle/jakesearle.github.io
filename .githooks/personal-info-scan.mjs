#!/usr/bin/env node
/**
 * Scan for personal information.
 *
 *   personal-info-scan.mjs                  scan the index (staged changes)
 *   personal-info-scan.mjs --range A B      scan everything introduced A..B
 *
 * The range form runs from pre-push; the index form from `npm run hooks:test`.
 *
 * Two layers:
 *   1. Deterministic checks (always run, no network, hard block) — GPS EXIF in
 *      images, phone numbers, street addresses, credential-shaped lines.
 *   2. Claude judgment (runs if the `claude` CLI is available) — catches what
 *      regexes cannot: travel plans, medical details, home layout, other
 *      people's contact details.
 *
 * Layer 2 degrades to a warning if Claude is unavailable or slow; layer 1
 * still blocks. That keeps things working offline without silently dropping
 * the cheap, reliable checks.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_DIFF_BYTES = 200_000;
const CLAUDE_TIMEOUT_MS = 60_000;

const RED = '\x1b[31m';
const YEL = '\x1b[33m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

/** Paths whose contents are noise for this check. */
const SKIP_PATH = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)node_modules\//,
  /(^|\/)\.vitepress\/(cache|dist)\//,
  /\.min\.(js|css)$/,
  /(^|\/)\.githooks\//, // the scanner's own patterns are not findings
];

const IMAGE_EXT = /\.(jpe?g|heic|heif|tiff?)$/i;

/** Deterministic content patterns. Each returns a human-readable label. */
const PATTERNS = [
  {
    label: 'phone number',
    re: /(?:\+?1[-.\s]?)?\(?\b[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  },
  {
    label: 'street address',
    re: /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Ter|Terrace|Pl|Place|Cir|Circle|Hwy|Highway)\b\.?/g,
  },
  {
    // Curly quotes included on purpose: the leak this hook exists to prevent
    // used them.
    label: 'password / passphrase',
    re: /\b(?:wifi|wi-fi|ssid|password|passphrase|passcode|pin)\b[^\n]{0,40}["'‘’“”][^"'‘’“”\n]{6,}["'‘’“”]/gi,
  },
  { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { label: 'GitHub token', re: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { label: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'API secret key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
];

function git(args, opts = {}) {
  return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024, ...opts });
}

/** Strings that are deliberately public and must never trip the scanner. */
function loadAllowlist() {
  const f = join(HERE, 'allowlist.txt');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/**
 * True if the JPEG/TIFF buffer carries a GPS IFD pointer (EXIF tag 0x8825).
 * Hand-rolled so the hook needs no native EXIF dependency.
 */
function hasGpsExif(buf) {
  const i = buf.indexOf('Exif\0\0', 0, 'latin1');
  if (i < 0) return false;
  const t = i + 6;
  if (t + 8 > buf.length) return false;
  const le = buf.toString('latin1', t, t + 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  try {
    const off = u32(t + 4);
    const n = u16(t + off);
    for (let k = 0; k < n; k++) {
      const p = t + off + 2 + k * 12;
      if (p + 12 > buf.length) break;
      if (u16(p) === 0x8825) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * A scan target. Either the index (pre-commit / `npm run hooks:test`) or a
 * commit range (pre-push), so the same checks serve both hooks.
 */
function indexTarget() {
  return {
    label: 'staged changes',
    entries() {
      const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString(
        'utf8'
      );
      return out
        .split('\0')
        .filter(Boolean)
        .filter((f) => !SKIP_PATH.some((re) => re.test(f)))
        .map((path) => ({ path, ref: `:${path}` }));
    },
    diffFor: (paths) => ['diff', '--cached', '--', ...paths],
  };
}

/**
 * Every blob introduced between base and tip — not the net diff.
 *
 * A secret that is committed and then deleted in a later commit does not
 * appear in `git diff base tip`, but its blob still ships to the remote and
 * stays readable there. That is the exact shape of the leak this repo already
 * had, so the range scan walks objects rather than the endpoint diff.
 */
function rangeTarget(base, tip) {
  return {
    label: `${base.slice(0, 8)}..${tip.slice(0, 8)}`,
    entries() {
      const listed = git(['rev-list', `${base}..${tip}`, '--objects'])
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const sp = line.indexOf(' ');
          return sp < 0 ? null : { sha: line.slice(0, sp), path: line.slice(sp + 1) };
        })
        .filter((e) => e && e.path && !SKIP_PATH.some((re) => re.test(e.path)));
      if (listed.length === 0) return [];

      // One batch-check call to drop trees, keeping only blobs.
      const check = spawnSync('git', ['cat-file', '--batch-check'], {
        input: listed.map((e) => e.sha).join('\n') + '\n',
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      const types = (check.stdout || '').split('\n');
      const out = [];
      const seen = new Set();
      listed.forEach((e, i) => {
        if (!/ blob /.test(types[i] || '')) return;
        if (seen.has(e.sha)) return; // same content under several paths
        seen.add(e.sha);
        out.push({ path: e.path, ref: e.sha });
      });
      return out;
    },
    // Every patch in the range, so intermediate states are visible too.
    diffFor: (paths) => ['log', '-p', '--no-color', `${base}..${tip}`, '--', ...paths],
  };
}

/** Blob content at the target's revision — not the working tree, which may differ. */
function blobAt(entry) {
  try {
    return git(['show', entry.ref]);
  } catch {
    return null;
  }
}

function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function deterministicScan(entries, allow) {
  const findings = [];
  const textFiles = new Set();
  for (const entry of entries) {
    const f = entry.path;
    const buf = blobAt(entry);
    if (!buf) continue;

    if (IMAGE_EXT.test(f) && hasGpsExif(buf)) {
      findings.push({
        file: f,
        label: 'GPS coordinates in image EXIF',
        detail: 'strip with: exiftool -all= --icc_profile:all -overwrite_original ' + f,
      });
      continue;
    }
    if (isProbablyBinary(buf)) continue;
    textFiles.add(f);

    const text = buf.toString('utf8');
    for (const { label, re } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const hit = m[0];
        if (allow.some((a) => hit.includes(a))) continue;
        const line = text.slice(0, m.index).split('\n').length;
        findings.push({ file: `${f}:${line}`, label, detail: hit.trim().slice(0, 80) });
      }
    }
  }
  return { findings, textFiles: [...textFiles] };
}

function claudeScan(target, textFiles) {
  if (textFiles.length === 0) return { skipped: 'no textual changes' };

  const probe = spawnSync('claude', ['--version'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) return { skipped: 'claude CLI not found' };

  // Only text paths: piping a binary diff wastes the call and can fail outright.
  let diff = git(target.diffFor(textFiles)).toString('utf8');
  if (!diff.trim()) return { skipped: 'no textual diff' };
  let truncated = false;
  if (diff.length > MAX_DIFF_BYTES) {
    diff = diff.slice(0, MAX_DIFF_BYTES);
    truncated = true;
  }

  const schema = JSON.stringify({
    type: 'object',
    properties: {
      block: { type: 'boolean' },
      findings: { type: 'array', items: { type: 'string' } },
    },
    required: ['block', 'findings'],
    additionalProperties: false,
  });

  const prompt = [
    'You are a pre-commit guard for a PUBLIC repository that auto-deploys to a public website.',
    'The git diff of staged changes is on stdin. Obvious patterns (phone numbers, street',
    'addresses, API keys, GPS EXIF) are already checked separately — focus on judgment calls:',
    '',
    '- home or workplace details: layout, alarm/entry instructions, neighbourhood landmarks',
    '- travel plans or statements that a home is empty at a given time',
    '- health or medical details, medications and where they are kept',
    "- other people's names paired with contact details, or any information about a private",
    '  individual who has not obviously consented to publication',
    '- schedules or routines that reveal where someone predictably is',
    '- credentials or network names described in prose rather than key/value form',
    '',
    "Do NOT flag: the repo owner's own public identity (name, public site, public email),",
    'ordinary code, dependency names, public documentation, or fictional/sample data.',
    'Set block=true only if something genuinely should not be published. Each finding should',
    'name the file and what is exposed. Reply per the schema.',
  ].join('\n');

  const res = spawnSync(
    'claude',
    [
      '-p',
      '--model',
      'haiku',
      // --json-schema delivers the answer as a tool call, which costs a turn
      // of its own: a clean run reports num_turns 2. At 1 the cap landed below
      // the happy path and roughly half of runs died as error_max_turns.
      '--max-turns',
      '3',
      '--no-session-persistence',
      '--disable-slash-commands',
      '--output-format',
      'json',
      '--json-schema',
      schema,
      prompt,
    ],
    { input: diff, encoding: 'utf8', timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
  );

  if (res.error || res.status !== 0) {
    // The CLI reports its own failures in the stdout envelope and leaves
    // stderr empty, so check there before falling back to a bare exit code.
    let subtype = '';
    try {
      subtype = JSON.parse(res.stdout || '{}').subtype || '';
    } catch {
      // Not JSON (crashed before emitting the envelope) — stderr it is.
    }
    const why =
      res.error?.code === 'ETIMEDOUT'
        ? `timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`
        : (res.stderr || '').trim().split('\n').pop() ||
          subtype ||
          `exited ${res.status ?? res.error?.code ?? 'abnormally'}`;
    return { skipped: why.slice(0, 200) };
  }
  try {
    const env = JSON.parse(res.stdout);
    const out = env.structured_output ?? JSON.parse(env.result);
    if (typeof out?.block !== 'boolean') return { skipped: 'unrecognized response' };
    return { block: out.block, findings: out.findings ?? [], truncated };
  } catch {
    return { skipped: 'could not parse response' };
  }
}

function main() {
  if (process.env.SKIP_PII_CHECK === '1') {
    console.error(`${YEL}⚠  personal-info scan skipped (SKIP_PII_CHECK=1)${OFF}`);
    return 0;
  }

  // No args: scan the index. `--range <base> <tip>`: scan a commit range.
  const argv = process.argv.slice(2);
  let target;
  if (argv[0] === '--range') {
    if (!argv[1] || !argv[2]) {
      console.error('usage: personal-info-scan.mjs [--range <base> <tip>]');
      return 2;
    }
    target = rangeTarget(argv[1], argv[2]);
  } else {
    target = indexTarget();
  }

  const entries = target.entries();
  if (entries.length === 0) return 0;

  const allow = loadAllowlist();
  const { findings: hard, textFiles } = deterministicScan(entries, allow);
  const soft = claudeScan(target, textFiles);

  const blocked = hard.length > 0 || soft.block === true;

  if (hard.length) {
    console.error(`\n${RED}✖ Personal information found in ${target.label}${OFF}\n`);
    for (const f of hard) {
      console.error(`  ${RED}${f.label}${OFF} — ${f.file}`);
      console.error(`    ${DIM}${f.detail}${OFF}`);
    }
  }

  if (soft.block) {
    console.error(`\n${RED}✖ Claude flagged personal information${OFF}\n`);
    for (const f of soft.findings) console.error(`  ${RED}•${OFF} ${f}`);
    if (soft.truncated) {
      console.error(
        `  ${DIM}(diff truncated to ${MAX_DIFF_BYTES} bytes; review the rest yourself)${OFF}`
      );
    }
  } else if (soft.skipped) {
    console.error(`${YEL}⚠  Claude check skipped: ${soft.skipped}${OFF}`);
    console.error(`${DIM}   Pattern checks still ran.${OFF}`);
  }

  if (!blocked) return 0;

  const verb = argv[0] === '--range' ? 'Push' : 'Commit';
  console.error(`\n${DIM}${verb} blocked. Fix the above, or bypass deliberately with:${OFF}`);
  console.error(`${DIM}  SKIP_PII_CHECK=1 git ${verb.toLowerCase()} ...${OFF}`);
  if (verb === 'Push') {
    console.error(
      `${DIM}  Findings are in commits that already exist — amend or rebase to fix them.${OFF}`
    );
  }
  console.error(
    `${DIM}If a match is a false positive, add the exact string to .githooks/allowlist.txt${OFF}\n`
  );
  return 1;
}

process.exit(main());
