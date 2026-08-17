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
];
