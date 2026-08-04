/**
 * ESLint config for React component libraries (packages/ui).
 */
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

import { createBaseConfig } from './base.js';

/**
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createReactLibraryConfig({ tsconfigRootDir }) {
  return [
    ...createBaseConfig({ tsconfigRootDir }),
    {
      files: ['**/*.{ts,tsx}'],
      plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
      languageOptions: {
        globals: { ...globals.browser },
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      // Pinned, not 'detect'. Detection calls `context.getFilename()`, which ESLint 10
      // removed, so every rule that checks the React version throws before it can report
      // anything — the whole plugin fails to load rather than degrading. React is pinned
      // in the catalog anyway, so detection was only ever re-deriving a known constant.
      settings: { react: { version: '19.2' } },
      rules: {
        ...react.configs.flat.recommended.rules,
        ...reactHooks.configs.recommended.rules,
        ...jsxA11y.flatConfigs.strict.rules,
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/jsx-key': 'error',
        'react/no-array-index-key': 'error',
        'react/jsx-no-useless-fragment': 'error',
        'unicorn/filename-case': [
          'error',
          { cases: { kebabCase: true }, ignore: [/^[A-Z]+\.md$/] },
        ],
      },
    },
    {
      files: ['**/*.stories.tsx'],
      rules: { 'max-lines': 'off', '@typescript-eslint/no-magic-numbers': 'off' },
    },
  ];
}

export default createReactLibraryConfig;
