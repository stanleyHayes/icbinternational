/**
 * ESLint config for the NestJS core banking API.
 *
 * Adds the two house rules (no float money, no ambient clock) and the architectural
 * layering boundaries from agent_plan.md §2.3. Domain code must stay framework-free:
 * if `domain/` can import Nest or Mongoose, it will, and then it stops being testable.
 */
import { createBaseConfig } from './base.js';

/** Where each layer is allowed to import from. Violations are errors, not warnings. */
const LAYER_BOUNDARIES = [
  {
    target: './src/domain',
    from: ['./src/modules', './src/database', './src/rails', './src/common'],
    message:
      'domain/ must stay framework-free and dependency-free. Depend on ports, not implementations.',
  },
  {
    target: './src/domain',
    from: './node_modules/@nestjs',
    message: 'domain/ must not import NestJS. Keep the domain plain TypeScript.',
  },
  {
    target: './src/rails',
    from: './src/modules',
    message: 'rails/ implement ports. They must not reach back into feature modules.',
  },
];

/**
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createNestConfig({ tsconfigRootDir }) {
  return [
    ...createBaseConfig({ tsconfigRootDir }),
    {
      files: ['src/**/*.ts'],
      rules: {
        'reliance/no-float-money': 'error',
        'reliance/no-ambient-clock': 'error',
        'import-x/no-restricted-paths': ['error', { zones: LAYER_BOUNDARIES }],
        // Nest relies on parameter decorators and metadata reflection.
        '@typescript-eslint/parameter-properties': 'off',
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
      },
    },
    {
      // The clock implementation is the one place allowed to read the wall clock,
      // and migrations/seeds run outside request scope.
      files: ['src/common/clock/**', 'src/seed/**', 'src/**/*.migration.ts'],
      rules: { 'reliance/no-ambient-clock': 'off' },
    },
    {
      // Nest bootstrap legitimately logs before the logger exists.
      files: ['src/main.ts'],
      rules: { 'no-console': 'off' },
    },
    {
      // The environment schema IS the specification of these values. Extracting each
      // Zod default to a named constant would move the spec away from the field it
      // describes and make the contract harder to read, not safer.
      files: ['src/config/configuration.ts'],
      rules: { '@typescript-eslint/no-magic-numbers': 'off' },
    },
    {
      // A Nest constructor is filled by the container and never called by hand, so the
      // positional-argument confusion `max-params` guards against cannot occur. Six is
      // still a ceiling: past that a service is doing too much, and `max-lines` and
      // `sonarjs/cognitive-complexity` remain in force to catch exactly that.
      files: ['src/**/*.service.ts', 'src/**/*.controller.ts', 'src/**/*.guard.ts'],
      rules: { 'max-params': ['error', 6] },
    },
    {
      // Seed and fixture data are tables, not logic. A merchant's price range and a
      // persona's salary ARE the specification of the fixture; extracting each to a named
      // constant would move the data away from the thing it describes and make the file
      // unreadable. Same reasoning as the Zod schemas and the environment config above.
      files: ['src/seed/**/*.ts'],
      rules: { '@typescript-eslint/no-magic-numbers': 'off' },
    },
    {
      // Reference directories are data files: a list of billers, of branch locations, of
      // merchants. `max-lines` is a complexity budget, and a table has no complexity to
      // budget — splitting the UK's branch list across two files to get under 250 lines
      // makes it harder to read and no simpler. The *shape* of each row is still checked
      // by its type, and any logic in these files is still held to the normal limits.
      files: ['src/seed/**/*-directory.ts', 'src/seed/**/catalogue/**/*.ts'],
      rules: { 'max-lines': 'off' },
    },
    {
      // Domain value objects expose an options-object factory (`Posting.create({...})`)
      // and keep a private positional constructor so fields stay `readonly` parameter
      // properties. The positional list is an implementation detail, never a call site.
      files: ['src/domain/**/*.ts'],
      rules: { 'max-params': ['error', { max: 12 }] },
    },
  ];
}

export default createNestConfig;
