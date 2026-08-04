import { createJestConfig } from '@reliance/config/jest/base';

export default createJestConfig({
  tsx: true,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/index.ts',
    '!**/*.d.ts',
    '!**/*.test.{ts,tsx}',
    '!**/*.stories.tsx',
    // Emitted by scripts/build-theme-css.mjs and gated by `theme:check`, not by tests.
    '!**/*.generated.ts',
    '!**/test/**',
  ],
});
