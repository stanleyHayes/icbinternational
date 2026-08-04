import { createBaseConfig } from '@reliance/config/eslint/base';

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/__tests__/**'],
    rules: {
      // This package IS the money implementation, so it names the scale constants that
      // everyone else is forbidden from hardcoding — but it still never touches a float.
      'reliance/no-float-money': 'error',
      'reliance/no-ambient-clock': 'error',
    },
  },
];
