#!/usr/bin/env node
/**
 * Product-voice guard — enforces `agent_plan.md` §4.6.
 *
 * Reliance Bank presents as a bank. No rendered surface may disclose that it is a
 * simulation, and "we'll remember not to" is not a control — a single agent writing a
 * well-meaning empty state undoes it. This runs in CI.
 *
 * It scans only **string literals and JSX text** in user-facing trees. Code comments and
 * identifiers are deliberately exempt: `simulatedFunding` is an accurate function name and
 * a comment explaining the simulated rails is exactly where that honesty belongs. What
 * matters is what reaches a screen.
 *
 * Usage:  node scripts/check-product-voice.mjs [--verbose]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Trees whose strings are rendered to a person — in a browser, an email or an API error.
 * Everything else in the repo may say exactly what this project is.
 */
const USER_FACING = [
  'apps/web-marketing',
  'apps/web-client',
  'apps/web-admin',
  'packages/ui/src',
  'apps/api/src/modules/notifications',
  'apps/api/src/modules/cms',
  'apps/api/src/modules/public',
  // Seeded content is product content: it becomes marketing pages, biller names,
  // transaction narratives and branch addresses that customers read.
  'apps/api/src/seed',
  // So is fixture content. These factories feed the marketing site and both dashboards
  // whenever the apps run against mocks, which is how they are developed and demonstrated
  // — `faker.lorem` output reached a live insights page before this tree was scanned.
  'packages/mocks/src/factories',
];

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mdx', '.json', '.html']);

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo']);

/** Test and story files describe the product; they do not ship as it. */
const SKIP_FILE = /\.(test|spec|stories)\.[jt]sx?$/;

/**
 * Terms that disclose the nature of the project. Word-boundary matched, case-insensitive.
 * Keep this list in sync with §4.6 — it is the machine-readable half of that section.
 */
const BANNED = [
  /\bsimulat(?:e|es|ed|ing|ion|ions|or)\b/i,
  /\bdemos?\b/i,
  /\bdemonstration\b/i,
  /\bsandbox(?:ed)?\b/i,
  /\bfake\b/i,
  /\bmocked?\b/i,
  /\bdummy\b/i,
  /\bplaceholder text\b/i,
  /\blorem ipsum\b/i,
  /\btest (?:bank|account|mode|data)\b/i,
  /\bpractice account\b/i,
  /\bnot a real bank\b/i,
  /\bno real money\b/i,
  /\bfor (?:illustrative|demonstration) purposes\b/i,
  /\bthis is only a\b/i,
  /**
   * A registrable domain in rendered copy.
   *
   * "Reliance Bank" collides with a real institution, so a polished bank UI linking to a
   * name someone could actually own is an impersonation risk however it was meant. `.example`
   * is IANA-reserved: it cannot be registered, resolved, or sent mail. §4.6 binds email and
   * link domains to it, and this is that rule made mechanical.
   */
  /\breliancebank\.(?:com|co\.uk|net|org|bank|io|app)\b/i,
];

/**
 * Strips comments so that an honest explanation of the architecture is never mistaken for
 * product copy. Crude but sufficient: the scanner then only looks at quoted strings, so a
 * stray unbalanced quote inside a comment is the only thing this protects against.
 */
function stripComments(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
    .replaceAll(/^\s*\*.*$/gm, ' ');
}

/**
 * Removes module specifiers.
 *
 * A path is not copy. `import { SimulatedRateProvider } from './simulated-rate.provider.js'`
 * names a file accurately and can never reach a screen, but it is a string literal like any
 * other, so the scanner flagged it. Renaming the file to satisfy a copy rule would make the
 * code less honest about itself in order to make the check pass — the wrong trade in both
 * directions.
 */
function stripModuleSpecifiers(source) {
  return source
    .replaceAll(/^\s*(?:import|export)\s[^;\n]*?from\s*['"`][^'"`]*['"`]/gm, ' ')
    .replaceAll(/^\s*import\s*['"`][^'"`]*['"`]/gm, ' ')
    .replaceAll(/\bimport\(\s*['"`][^'"`]*['"`]\s*\)/g, ' ')
    .replaceAll(/\brequire\(\s*['"`][^'"`]*['"`]\s*\)/g, ' ');
}

/**
 * Extracts anything that can reach a screen: quoted strings and JSX text nodes.
 * Returns `{ text, line }` so a failure can point at a line the author can fix.
 */
function extractRenderableText(source) {
  const cleaned = stripModuleSpecifiers(stripComments(source));
  const found = [];

  const patterns = [
    /'((?:[^'\\\n]|\\.)*)'/g, // single-quoted
    /"((?:[^"\\\n]|\\.)*)"/g, // double-quoted
    /`((?:[^`\\]|\\.)*)`/g, // template literal
    />([^<>{}]{3,})</g, // JSX text between tags
  ];

  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      const text = match[1]?.trim();
      if (!text) continue;
      found.push({ text, line: lineOf(cleaned, match.index ?? 0) });
    }
  }

  return found;
}

function lineOf(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\n') line += 1;
  }
  return line;
}

function* walk(directory) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return; // A tree that does not exist yet is not a failure.
  }

  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue;

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
      continue;
    }

    const extension = entry.slice(entry.lastIndexOf('.'));
    if (!SCANNED_EXTENSIONS.has(extension) || SKIP_FILE.test(entry)) continue;
    yield path;
  }
}

/**
 * Trees that are mostly internal but contain individual strings which DO render.
 *
 * A Zod `.default('…')` on a transaction narrative, or a `description:` on a seeded
 * product, ends up on a customer's statement even though the file around it is plumbing.
 * Scanning these trees wholesale would drown in false positives from error messages and
 * TSDoc, so only the string positions that actually reach a screen are examined.
 */
const MIXED_TREES = ['packages/contracts/src', 'apps/api/src/domain', 'apps/api/src/modules'];

/** Keys whose values are displayed verbatim to a person. */
const RENDERED_KEYS =
  'narrative|description|label|title|subtitle|heading|message|cta|caption|summary|tagline|name';

const RENDERED_POSITIONS = [
  // Zod schema defaults: `.default('Credit transfer received')`
  /\.default\(\s*['"`]([^'"`]{3,})['"`]\s*\)/g,
  // Object literal values on a rendered key: `narrative: 'Monthly maintenance fee'`
  new RegExp(`\\b(?:${RENDERED_KEYS})\\s*:\\s*['"\`]([^'"\`]{3,})['"\`]`, 'g'),
];

function extractRenderedDefaults(source) {
  const cleaned = stripModuleSpecifiers(stripComments(source));
  const found = [];

  for (const pattern of RENDERED_POSITIONS) {
    for (const match of cleaned.matchAll(pattern)) {
      const text = match[1]?.trim();
      if (text) found.push({ text, line: lineOf(cleaned, match.index ?? 0) });
    }
  }

  return found;
}

function collect(tree, extract, violations) {
  let filesScanned = 0;

  for (const path of walk(join(ROOT, tree))) {
    filesScanned += 1;
    const source = readFileSync(path, 'utf8');

    for (const { text, line } of extract(source)) {
      const pattern = BANNED.find((candidate) => candidate.test(text));
      if (pattern) {
        violations.push({ file: relative(ROOT, path), line, text, pattern: String(pattern) });
      }
    }
  }

  return filesScanned;
}

function scan() {
  const violations = [];
  let filesScanned = 0;

  for (const tree of USER_FACING) {
    filesScanned += collect(tree, extractRenderableText, violations);
  }
  for (const tree of MIXED_TREES) {
    filesScanned += collect(tree, extractRenderedDefaults, violations);
  }

  return { violations, filesScanned };
}

const { violations, filesScanned } = scan();
const verbose = process.argv.includes('--verbose');

if (violations.length === 0) {
  console.log(`✓ product voice: ${filesScanned} user-facing files clean`);
  process.exit(0);
}

console.error(`\n✗ product voice: ${violations.length} violation(s) in ${filesScanned} files\n`);
console.error('  Reliance Bank presents as a bank (agent_plan.md §4.6). These strings reach a');
console.error('  screen and disclose otherwise. Rewrite them as real product copy.\n');

for (const violation of violations) {
  const excerpt = violation.text.length > 90 ? `${violation.text.slice(0, 90)}…` : violation.text;
  console.error(`  ${violation.file}:${violation.line}`);
  console.error(`    "${excerpt}"`);
  if (verbose) console.error(`    matched ${violation.pattern}`);
}

console.error('\n  Honest disclosure belongs in README.md, docs/ and code comments — never in copy.\n');
process.exit(1);
