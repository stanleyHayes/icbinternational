/**
 * Acceptance guard for the brand rule: zero hard-coded hex outside the token file.
 *
 * Two directions. First, no TypeScript source in this package may contain a hex literal at all —
 * generated mirrors excepted. Second, every hex that legitimately appears in the generated CSS
 * (the raw palette declarations) must be traceable to `brand/tokens/brand.tokens.json`; a hex in
 * the CSS that is not in the token file means someone edited generated output by hand.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import brandFile from '../../../../brand/tokens/brand.tokens.json';

const SRC_ROOT = join(__dirname, '..');
const STYLES_ROOT = join(SRC_ROOT, 'styles');
const HEX_LITERAL = /#[0-9a-f]{3,8}\b/gi;
const BLOCK_START = '/*';
const BLOCK_END = '*/';
const LINE_COMMENT = '//';

/**
 * Source with comments removed. Doc comments may *mention* a brand-fixed hex (the money semantics
 * are written down in the brand guide too); the rule bans hex in code, not in prose. Comments are
 * cut with indexOf and line filters rather than lazy regexes, which backtrack super-linearly.
 */
function stripComments(source: string): string {
  let out = '';
  let rest = source;

  for (;;) {
    const start = rest.indexOf(BLOCK_START);
    if (start === -1) return dropCommentLines(out + rest);

    const end = rest.indexOf(BLOCK_END, start + BLOCK_START.length);
    out += rest.slice(0, start);
    rest = end === -1 ? '' : rest.slice(end + BLOCK_END.length);
  }
}

/** Drops whole-line `//` comments. Inline code is kept; URLs inside strings never start a line. */
function dropCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(LINE_COMMENT))
    .join('\n');
}

/** Hex values that exist in the authoritative token file. */
function brandHexes(): ReadonlySet<string> {
  const found = JSON.stringify(brandFile).match(HEX_LITERAL) ?? [];
  return new Set(found.map((hex) => hex.toUpperCase()));
}

/** Every non-generated, non-test TypeScript source file under `src/`. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (
      entry.includes('.generated.') ||
      entry.endsWith('.test.ts') ||
      entry.endsWith('.test.tsx')
    ) {
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(path);
  }

  return out;
}

describe('zero hard-coded hex outside the token file', () => {
  it('finds no hex literal in any TypeScript source', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_ROOT)) {
      const matches = stripComments(readFileSync(file, 'utf8')).match(HEX_LITERAL);
      if (matches !== null && matches.length > 0) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('traces every hex in the generated CSS back to the brand file', () => {
    const allowed = brandHexes();
    const untraceable: string[] = [];

    for (const file of ['theme.css', 'tailwind-theme.css']) {
      const matches = readFileSync(join(STYLES_ROOT, file), 'utf8').match(HEX_LITERAL) ?? [];

      for (const hex of matches) {
        if (!allowed.has(hex.toUpperCase())) untraceable.push(`${file}: ${hex}`);
      }
    }

    expect(untraceable).toEqual([]);
  });
});
