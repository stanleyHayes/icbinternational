import { createReactLibraryConfig } from '@reliance/config/eslint/react-library';

export default [
  ...createReactLibraryConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // eslint-plugin-react's 'detect' calls context.getFilename(), which ESLint 10 removed —
    // pin the version instead of letting the plugin probe for it.
    settings: { react: { version: '19.2' } },
  },
  {
    // Generated from brand.tokens.json; `scripts/build-theme-css.mjs --check` is its gate.
    ignores: ['src/foundation/brand.tokens.generated.json', 'src/styles/**'],
  },
  {
    // A component's return is a declarative markup tree. Line count there measures how
    // much UI it renders, not how hard it is to follow — `sonarjs/cognitive-complexity`
    // stays on and is the rule that actually catches tangled components.
    files: ['src/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/**/*.test.tsx'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // Controller hooks compose a handful of small, individually trivial closures and return
    // them as one object. The line count measures how many collaborators the component has,
    // not how hard any of it is to follow — `sonarjs/cognitive-complexity` stays on, and it
    // is the rule that actually detects tangled logic. Splitting these purely to satisfy a
    // line budget was tried and produced worse code: it moved ref writes across a hook
    // boundary and changed React's attachment timing.
    files: ['src/**/*-controller.ts', 'src/hooks/**/*.ts'],
    rules: {
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
];
