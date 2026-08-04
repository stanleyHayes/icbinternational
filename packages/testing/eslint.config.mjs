import { createBaseConfig } from '@reliance/config/eslint/base';

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/__tests__/**'],
    rules: {
      // This package produces money-shaped test data but never does arithmetic on it.
      'reliance/no-float-money': 'error',
      'reliance/no-ambient-clock': 'error',
    },
  },
];
