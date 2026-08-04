import { createJestConfig } from '@reliance/config/jest/base';

/** The key the shared config registers its SWC transform under. */
const TS_TRANSFORM_KEY = '^.+\\.(t|j)sx?$';

/** ESM-only packages the suite loads, directly or through msw. */
const ESM_DEPENDENCIES = [
  '@faker-js/faker',
  'msw',
  '@mswjs',
  '@open-draft',
  '@bundled-es-modules',
  'until-async',
  'strict-event-emitter',
  'is-node-process',
  'outvariant',
  'headers-polyfill',
  'type-fest',
  'rettime',
  'tough-cookie',
  'graphql',
];

const base = createJestConfig({
  // Handlers are exercised through the route-coverage, coherence and MSW suites rather
  // than one by one; the store and the factories are where the logic worth measuring by
  // line count lives.
  collectCoverageFrom: [
    'db/**/*.ts',
    'factories/**/*.ts',
    '!**/__tests__/**',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
});

export default {
  ...base,

  // The shared transform matches `.ts` and `.js` only. `msw` and `@faker-js/faker` both
  // ship `.mjs`, and an untransformed `.mjs` reaches the CommonJS loader as a bare
  // `SyntaxError: Cannot use import statement outside a module`.
  transform: { ...base.transform, '^.+\\.mjs$': base.transform[TS_TRANSFORM_KEY] },

  // ...and `node_modules` is spared from transformation by default, so those packages
  // and the ESM-only dependencies msw pulls in have to be opted back in. The `.*` is
  // load-bearing: under pnpm the real path is
  // `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...`, and an allowlist that
  // only looks at the segment right after the first `node_modules/` never sees it.
  transformIgnorePatterns: [`/node_modules/(?!.*(${ESM_DEPENDENCIES.join('|')})/)`],
};
