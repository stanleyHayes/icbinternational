/**
 * ESLint config for the three Next.js applications.
 *
 * Server components, route handlers and client components live in one tree, so the
 * config leans on Next's own plugin for the boundaries the compiler enforces, and
 * relaxes `max-lines-per-function` for page components (JSX trees are wide, not complex).
 */
import nextPlugin from '@next/eslint-plugin-next';

import { createReactLibraryConfig } from './react-library.js';

/**
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createNextConfig({ tsconfigRootDir }) {
  return [
    ...createReactLibraryConfig({ tsconfigRootDir }),
    {
      files: ['**/*.{ts,tsx}'],
      plugins: { '@next/next': nextPlugin },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
    {
      // A page is a declarative tree. Line count there measures markup, not complexity —
      // cognitive-complexity still applies and is the rule that actually matters.
      // `**/app/**` rather than `app/**`: these apps keep their routes under `src/app`,
      // and the narrower glob silently matched nothing — the override looked present in
      // the config and did nothing at all.
      files: [
        '**/app/**/page.tsx',
        '**/app/**/layout.tsx',
        '**/app/**/template.tsx',
        '**/app/**/error.tsx',
        '**/app/**/not-found.tsx',
        '**/app/**/loading.tsx',
        // Route-level generated images are one long JSX tree with inline styles.
        '**/app/**/opengraph-image.tsx',
        '**/app/**/twitter-image.tsx',
        '**/app/**/icon.tsx',
      ],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      files: ['**/*.config.{ts,js,mjs}', 'next-env.d.ts'],
      rules: { 'import-x/no-default-export': 'off', '@typescript-eslint/no-magic-numbers': 'off' },
    },
  ];
}

export default createNextConfig;
