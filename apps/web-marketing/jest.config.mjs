import { createJestConfig } from '@reliance/config/jest/base';

const config = createJestConfig({
  rootDir: '.',
  tsx: true,
  // Stock jsdom has no fetch globals, and MSW reaches for `Request` at import time — see
  // the environment file for why the copy happens there rather than in a setup file.
  testEnvironment: '<rootDir>/src/test/jsdom-with-fetch-environment.mjs',
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
  // MSW reaches ESM-only packages, and app tests import the mock handlers to drive a
  // screen without a server. Without these the suite dies on the first `import`.
  transformDependencies: [
    'msw',
    '@mswjs',
    '@open-draft',
    '@faker-js',
    'rettime',
    'until-async',
    'strict-event-emitter',
  ],
  coverageThreshold: { branches: 0, functions: 0, lines: 0, statements: 0 },
});

const SWC_TRANSFORM_KEY = '^.+\\.(t|j)sx?$';

export default {
  ...config,
  transform: {
    ...config.transform,
    // `rettime`, an MSW dependency, ships ESM-only `.mjs` files, which the shared pattern's
    // `(t|j)sx?$` never matches. Same transformer, same options, one more extension.
    '^.+\\.mjs$': config.transform[SWC_TRANSFORM_KEY],
  },
  moduleNameMapper: {
    ...config.moduleNameMapper,
    // `@/` resolves for tsc and for Next, but Jest has its own resolver. Without this a
    // test importing `@/lib/...` cannot find it, which is why one lane shipped no tests
    // rather than write suites in relative paths that would need rewriting later.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
