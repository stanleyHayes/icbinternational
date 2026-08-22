import { createNextConfig } from '@reliance/config/eslint/next';

export default [
  ...createNextConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Jest loads test environments itself, so this file must stay plain `.mjs`, and no
    // tsconfig includes it — which the type-aware project service reports as a parse
    // error. Lint it without the program instead of widening the shared config's
    // `allowDefaultProject` list for one app's test fixture. Jest environments also
    // require a default export, which the source-tree rule forbids.
    files: ['src/test/*.mjs'],
    languageOptions: { parserOptions: { projectService: false } },
    rules: { 'import-x/no-default-export': 'off' },
  },
  {
    // The photography manifest is a list of files and the pixel dimensions they happen to
    // have. A dimension is a measurement of the asset, not a tunable: naming each one
    // would produce a dozen single-use constants that say `PORTRAIT_EDGE = 800` and then
    // are never referred to again, which buries the shape of the manifest rather than
    // clarifying it. `@reliance/contracts` and `@reliance/mocks` switch the rule off for
    // the same reason — the literals are the data.
    files: ['src/content/photography.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
];
