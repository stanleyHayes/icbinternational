/**
 * Base ESLint flat config — the quality gate described in agent_plan.md §2.4.
 *
 * These thresholds are deliberately strict. A file that trips `max-lines` has not
 * hit a lint nag, it has outgrown its single responsibility. Split it.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import globals from 'globals';

import reliance from './plugin/index.js';

/**
 * Values so universal that naming them would be noise, not clarity.
 * The `n`-suffixed entries are the bigint equivalents — money code is written in
 * bigint, and `0n`/`1n` are identities, not magic.
 */
const BENIGN_NUMBERS = [-1, 0, 1, 2, 100, '-1n', '0n', '1n', '2n', '10n', '100n'];

export const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/*.generated.ts',
  '**/*.d.ts',
  // Written by `msw init`, shipped verbatim, and not ours to style. It is also the one
  // file in `public/` that looks like source, so it reaches the parser and fails there.
  '**/public/mockServiceWorker.js',
];

/** Complexity + size budgets. Applied to source; relaxed for tests. */
export const complexityRules = {
  'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 4],
  'max-depth': ['error', 3],
  'max-nested-callbacks': ['error', 3],
  complexity: ['error', 10],
  'sonarjs/cognitive-complexity': ['error', 15],
};

/** Rules that keep the codebase honest about types and intent. */
export const strictnessRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'off',
  '@typescript-eslint/switch-exhaustiveness-check': 'off',
  'no-magic-numbers': 'off',
  '@typescript-eslint/no-magic-numbers': [
    'error',
    {
      ignore: BENIGN_NUMBERS,
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true,
      ignoreEnums: true,
      ignoreNumericLiteralTypes: true,
      ignoreReadonlyClassProperties: true,
      enforceConst: true,
      detectObjects: false,
    },
  ],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-console': ['error', { allow: ['warn', 'error'] }],
  'no-param-reassign': ['error', { props: true }],
  'prefer-const': 'error',
  'no-return-await': 'error',
  'no-restricted-syntax': [
    'error',
    {
      selector: 'TSEnumDeclaration[const=true]',
      message: 'const enums do not survive isolatedModules. Use a plain enum or a const object.',
    },
    {
      selector: "CallExpression[callee.name='require']",
      message: 'Use ESM imports.',
    },
  ],
};

/** Consistency rules — naming, imports, dead code. */
export const hygieneRules = {
  'unicorn/filename-case': [
    'error',
    { case: 'kebabCase', ignore: [/^__tests__$/, /^__mocks__$/, /^[A-Z]+\.md$/] },
  ],
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/no-null': 'off',
  'unicorn/prevent-abbreviations': 'off',
  'unicorn/no-array-reduce': 'off',
  'unicorn/prefer-top-level-await': 'off',
  'sonarjs/no-identical-functions': 'error',
  'sonarjs/no-duplicate-string': ['error', { threshold: 4 }],
  'sonarjs/no-nested-template-literals': 'error',
  'sonarjs/prefer-immediate-return': 'error',
  'sonarjs/no-collapsible-if': 'error',
  'sonarjs/no-redundant-jump': 'error',
  'import-x/order': [
    'error',
    {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      pathGroups: [{ pattern: '@reliance/**', group: 'internal', position: 'before' }],
      pathGroupsExcludedImportTypes: ['builtin'],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    },
  ],
  'import-x/no-duplicates': 'error',
  'import-x/no-cycle': ['error', { maxDepth: 4 }],
  'import-x/no-self-import': 'error',
};

/** Test files trade strictness for expressiveness — but never for `any`. */
export const testOverrides = {
  files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**', '**/__tests__/**'],
  rules: {
    'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': 'off',
    'max-nested-callbacks': 'off',
    '@typescript-eslint/no-magic-numbers': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'sonarjs/no-duplicate-string': 'off',
    'sonarjs/no-identical-functions': 'off',
    'sonarjs/no-alphabetical-sort': 'off',
    'sonarjs/pseudo-random': 'off',
    'reliance/no-float-money': 'off',
    'reliance/no-ambient-clock': 'off',
  },
};

/**
 * Builds the shared base config.
 *
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createBaseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores: IGNORE_PATTERNS },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    sonarjs.configs.recommended,
    {
      plugins: { unicorn, 'import-x': importX, reliance },
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        globals: { ...globals.node, ...globals.es2024 },
        parserOptions: {
          projectService: {
            /**
             * Build-tooling configs that no tsconfig includes.
             *
             * `eslint.config.mjs`, `jest.config.mjs`, `next.config.ts` and friends sit at a
             * package root and are deliberately outside `include` — they configure the
             * build rather than being built. The project service still has to place every
             * file it is handed in *some* program, and without this it fails them all with
             * "was not found by the project service", which is a parse error, not a lint
             * finding: the file is never examined at all.
             *
             * Listing them here types them against the nearest default project, so they are
             * linted like everything else. Kept to exact filenames rather than a `*.mjs`
             * glob so that a stray unincluded source file still fails loudly instead of
             * being quietly absorbed.
             */
            allowDefaultProject: [
              'eslint.config.mjs',
              'jest.config.mjs',
              'jest.config.js',
              'postcss.config.mjs',
              'next.config.mjs',
            ],
          },
          tsconfigRootDir,
        },
      },
      settings: {
        'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
      },
      rules: {
        ...complexityRules,
        ...strictnessRules,
        ...hygieneRules,
      },
    },
    testOverrides,
    prettier,
  );
}

export default createBaseConfig;
