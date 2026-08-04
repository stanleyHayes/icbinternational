/**
 * Shared Jest configuration.
 *
 * Transforms run through SWC rather than the TypeScript compiler: transpilation and
 * type-checking are separate jobs, and conflating them makes the test suite pay the
 * type-checker's cost on every run. `tsc --noEmit` owns correctness; SWC owns speed.
 */

/**
 * Per-test budget.
 *
 * Jest's own default is five seconds, which suits a pure unit test and does not suit this
 * repository: the integration suites talk to a Mongo replica set and hash passwords with
 * Argon2, and every one of them runs while `turbo` is building and testing forty-odd other
 * tasks on the same machine. Under that load a suite that finishes in 1.6s on its own has
 * been seen to take 28s, and the failure it reports is a timeout — which reads as a bug in
 * the code under test rather than as contention.
 *
 * Twenty-four files had already reached for `jest.setTimeout` individually, which is the
 * signal that the default was wrong for the repo rather than for those files. Raising it
 * here does not make a genuinely hung test pass; it stops a scheduling artefact from being
 * reported as a behavioural failure. Suites that need longer still set their own.
 */
const DEFAULT_TEST_TIMEOUT_MS = 30_000;

/**
 * Jest workers per package.
 *
 * Jest defaults to one worker per core less one, which is right for a single project and
 * wrong inside a monorepo: `turbo` already runs about ten package tasks at once, so the
 * default multiplies out to roughly seventy worker processes on an eight-core machine.
 * The machine then spends its time context-switching, and the first thing to fail is the
 * suite that holds a Mongo transaction open while it waits to be scheduled — the
 * concurrency tests, which are precisely the ones whose results matter most.
 *
 * Two per package leaves `turbo` as the source of parallelism and the box merely busy
 * rather than thrashing. Total wall-clock is close to unchanged, because the contention
 * the old setting created was costing more than the extra workers were winning.
 */
const DEFAULT_MAX_WORKERS = 2;

/** SWC options that mirror `@reliance/config/tsconfig/base.json`. */
const SWC_TRANSFORM = {
  jsc: {
    target: 'es2024',
    parser: { syntax: 'typescript', tsx: false, decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
    keepClassNames: true,
  },
  module: { type: 'commonjs' },
  sourceMaps: 'inline',
};

/** Coverage floor for ordinary packages. The ledger core overrides this to 100. */
export const DEFAULT_COVERAGE_THRESHOLD = {
  branches: 80,
  functions: 80,
  lines: 80,
  statements: 80,
};

/** Total coverage — used by `packages/money` and `apps/api/src/domain`. */
export const TOTAL_COVERAGE_THRESHOLD = {
  branches: 100,
  functions: 100,
  lines: 100,
  statements: 100,
};

/**
 * Builds a Jest config.
 *
 * @param {object} [options]
 * @param {string} [options.rootDir] Directory Jest treats as the root.
 * @param {boolean} [options.tsx] Enable TSX parsing for React packages.
 * @param {'node'|'jsdom'} [options.testEnvironment]
 * @param {string[]} [options.collectCoverageFrom]
 * @param {object} [options.coverageThreshold]
 * @param {string[]} [options.setupFilesAfterEnv]
 * @param {string[]} [options.transformDependencies] npm package names that ship ESM only
 *   and must therefore be transformed rather than skipped with the rest of node_modules.
 * @param {number} [options.testTimeout] Per-test budget in milliseconds.
 * @param {number|string} [options.maxWorkers] Worker processes this package may use.
 * @returns {import('jest').Config}
 */
export function createJestConfig(options = {}) {
  const {
    rootDir = 'src',
    tsx = false,
    testEnvironment = 'node',
    collectCoverageFrom = ['**/*.{ts,tsx}', '!**/index.ts', '!**/*.d.ts'],
    coverageThreshold = DEFAULT_COVERAGE_THRESHOLD,
    setupFilesAfterEnv = [],
    transformDependencies = [],
    testTimeout = DEFAULT_TEST_TIMEOUT_MS,
    maxWorkers = DEFAULT_MAX_WORKERS,
  } = options;

  const transform = {
    ...SWC_TRANSFORM,
    jsc: {
      ...SWC_TRANSFORM.jsc,
      parser: { ...SWC_TRANSFORM.jsc.parser, tsx },
      ...(tsx ? { transform: { react: { runtime: 'automatic' } } } : {}),
    },
  };

  return {
    rootDir,
    testEnvironment,
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    transform: { '^.+\\.(t|j)sx?$': ['@swc/jest', transform] },
    // pnpm nests real packages under .pnpm/<name>@<version>/, so the negative lookahead
    // has to match that layout rather than a flat node_modules/<name>.
    transformIgnorePatterns:
      transformDependencies.length === 0
        ? ['/node_modules/']
        : [`/node_modules/\\.pnpm/(?!(${transformDependencies.join('|')}))`],
    // Source files import with an explicit `.js` extension for NodeNext resolution;
    // Jest resolves the TypeScript file behind it.
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    // Build output is not source and must never be walked. A package whose `rootDir` is the
    // package root — the Next apps — otherwise has its haste map crawl `.next/`, where Jest
    // finds a directory whose `package.json` the build has since removed and fails with
    // `Cannot parse .next/build/package.json`. That reads as a broken test suite when it is
    // really a stale artefact from a previous build, and it clears on a `rm -rf .next` just
    // often enough to look intermittent.
    modulePathIgnorePatterns: ['<rootDir>/\\.next/', '<rootDir>/dist/', '<rootDir>/coverage/'],
    collectCoverageFrom,
    coverageDirectory: '../coverage',
    coverageThreshold: { global: coverageThreshold },
    setupFilesAfterEnv,
    testTimeout,
    maxWorkers,
    clearMocks: true,
    restoreMocks: true,
    verbose: false,
  };
}

export default createJestConfig;
