import { createBaseConfig } from '@reliance/config/eslint/base';

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.ts'],
    rules: {
      // Contract files are declarative. A schema module is a long list of short
      // definitions, not a long function — size here is not a complexity signal.
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      // `.max(120)` on a schema IS the specification of the field. Extracting each
      // bound to a named constant would move the contract away from the thing it
      // constrains and make the whole package harder to read, not easier.
      '@typescript-eslint/no-magic-numbers': 'off',
      // Enum member strings intentionally repeat their own key across modules.
      'sonarjs/no-duplicate-string': 'off',
    },
  },
];
