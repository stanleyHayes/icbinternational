import { createBaseConfig } from '@reliance/config/eslint/base';

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/resources/**/*.ts', 'src/provisional/**/*.ts'],
    rules: {
      // A resource module is a flat list of one-line route bindings. Splitting it at 250
      // lines would scatter one contract group across several files for no gain in
      // comprehension, which is the opposite of what the size budget is protecting.
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      // A resource factory is an object literal of one-line route bindings, not a
      // function with logic in it: its cyclomatic complexity is 1 no matter how many
      // routes the group has. `max-lines-per-function` is measuring the size of the
      // contract here, and the only way to satisfy it would be to shard each group
      // across arbitrary sub-factories that no reader would thank us for.
      'max-lines-per-function': 'off',
      // Route bindings differ only in path and schema, so several are structurally
      // identical by construction. Collapsing them behind a generic helper would hide
      // the one thing a reader comes here to check: which path a method calls.
      'sonarjs/no-identical-functions': 'off',
      // `.max(120)` on a provisional schema is the specification of the field, exactly
      // as it is in `@reliance/contracts`, which turns this rule off for the same reason.
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
];
