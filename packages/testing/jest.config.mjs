import { createJestConfig } from '@reliance/config/jest/base';

const config = createJestConfig({
  collectCoverageFrom: [
    '**/*.ts',
    '!index.ts',
    // Registration is two lines of `expect.extend`; it is exercised indirectly by
    // every matcher test.
    '!jest.setup.ts',
    '!matchers/register-matchers.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
});

// `@faker-js/faker` v10 is ESM-only, so it must go through the SWC transform like
// our own sources. The optional `.pnpm/` prefix covers pnpm's store layout, where
// the real path is `node_modules/.pnpm/@faker-js+faker@…/node_modules/@faker-js/…`.
// Any consumer whose tests touch the builders needs the same line.
config.transformIgnorePatterns = ['node_modules/(?!(?:\\.pnpm/)?@faker-js)'];

export default config;
