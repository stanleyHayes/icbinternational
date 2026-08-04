import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Determinism is a property of the whole directory, not of good intentions. One
 * `Math.random()` or `Date.now()` slipped into the kernel or the ports would break
 * the same-seed guarantee silently — the outcomes would still *look* plausible, they
 * would just never replay. So the guarantee is enforced where it can actually break:
 * on the source itself.
 */

/** Source files the determinism guarantee covers: kernel and ports, minus tests. */
function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .filter((entry) => !entry.parentPath.includes('__tests__'))
    .map((entry) => join(entry.parentPath, entry.name));
}

const KERNEL_DIR = join(__dirname, '..');
const PORTS_DIR = join(__dirname, '..', '..', 'ports');

const BANNED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /Math\.random/, why: 'Math.random breaks seeded reproducibility' },
  { pattern: /Date\.now\(/, why: 'Date.now bypasses the simulated clock' },
  { pattern: /new Date\(\)/, why: 'a bare new Date() bypasses the simulated clock' },
  { pattern: /performance\.now\(/, why: 'performance.now is wall-clock time' },
];

describe('the kernel and ports contain no ambient randomness or time', () => {
  const files = [...sourcesUnder(KERNEL_DIR), ...sourcesUnder(PORTS_DIR)];

  it('actually found the sources it polices', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((file) => [file.split('/rails/')[1] ?? file, file] as const))(
    '%s is free of banned sources of non-determinism',
    (_label, file) => {
      const source = stripComments(readFileSync(file, 'utf8'));
      const violations = BANNED.filter(({ pattern }) => pattern.test(source)).map(({ why }) => why);

      expect(violations).toEqual([]);
    },
  );
});

/** Removes block and line comments so the ban polices code, not documentation. */
function stripComments(source: string): string {
  let output = '';
  let cursor = 0;

  while (cursor < source.length) {
    const next = nextCommentStart(source, cursor);
    if (next === -1) return output + source.slice(cursor);

    output += source.slice(cursor, next);
    const end = source.startsWith('/*', next)
      ? source.indexOf('*/', next) + BLOCK_COMMENT_CLOSE.length
      : source.indexOf('\n', next);
    if (end < BLOCK_COMMENT_CLOSE.length) return output;
    cursor = end;
  }

  return output;
}

const BLOCK_COMMENT_CLOSE = '*/';

/** The index of the nearest `/*` or `//` at or after `from`, or -1. */
function nextCommentStart(source: string, from: number): number {
  const block = source.indexOf('/*', from);
  const line = source.indexOf('//', from);
  if (block === -1) return line;
  if (line === -1) return block;
  return Math.min(block, line);
}
