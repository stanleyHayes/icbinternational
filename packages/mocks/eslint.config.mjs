import { createBaseConfig } from '@reliance/config/eslint/base';

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/handlers/**/*.ts', 'src/factories/**/*.ts', 'src/db/**/*.ts'],
    rules: {
      // A handler module is a flat list of route bindings and a factory module a flat
      // list of shape builders. Both are declarations, not logic: splitting them at 250
      // lines would scatter one contract group across files for no gain in clarity.
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': 'off',
      // Fixture data is full of literal amounts, rates and counts. Naming each one would
      // bury the shape of the fixture under a wall of single-use constants.
      '@typescript-eslint/no-magic-numbers': 'off',
      // Handlers for sibling routes are structurally identical by construction — that
      // similarity is the point, not a smell to be abstracted away.
      'sonarjs/no-identical-functions': 'off',
      // Enum members and fixture strings repeat across factories by their nature.
      'sonarjs/no-duplicate-string': 'off',
      // Fixtures are deliberately pseudo-random and deliberately seeded; that is the
      // whole design, and faker is not a source of cryptographic material here.
      'sonarjs/pseudo-random': 'off',
      // A handler's entire job is to mutate the store it is handed. The rule protects
      // callers from being surprised by a mutated argument, and there is no surprise
      // here: `ctx.db` is the singleton the caller got from `db()`, mutating it is the
      // documented contract, and `resetMockDatabase()` is how a caller undoes it. The
      // binding itself is still protected — only property writes are allowed.
      'no-param-reassign': ['error', { props: false }],
    },
  },
];
