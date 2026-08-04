import { createJestConfig } from '@reliance/config/jest/base';

const config = createJestConfig({
  rootDir: '.',
  tsx: true,
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
  // MSW reaches ESM-only packages, and app tests import the mock handlers to drive a
  // screen without a server. Without these the suite dies on the first `import`.
  transformDependencies: ['msw', '@mswjs', 'rettime', 'until-async', 'strict-event-emitter'],
  coverageThreshold: { branches: 0, functions: 0, lines: 0, statements: 0 },
});

export default {
  ...config,
  moduleNameMapper: {
    ...config.moduleNameMapper,
    // `@/` resolves for tsc and for Next, but Jest has its own resolver. Without this a
    // test importing `@/lib/...` cannot find it, which is why one lane shipped no tests
    // rather than write suites in relative paths that would need rewriting later.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
