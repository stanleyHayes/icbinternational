import { createJestConfig } from '@reliance/config/jest/base';

export default createJestConfig({
  rootDir: '.',
  // Completes the environment before any test module loads. See the file for why
  // this is central rather than per-test.
  setupFilesAfterEnv: ['<rootDir>/test/setup-env.ts'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/index.ts',
    '!src/seed/**',
  ],
  coverageThreshold: { branches: 70, functions: 75, lines: 80, statements: 80 },
  // otplib 13 → @otplib/plugin-base32-scure → @scure/base, all ESM only.
  transformDependencies: ['otplib', '@otplib\\+', '@scure\\+', '@noble\\+'],
});
