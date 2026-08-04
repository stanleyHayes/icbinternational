import { createJestConfig } from '@reliance/config/jest/base';

export default createJestConfig({
  // Resource modules are thin route bindings whose correctness is a type error, not a
  // runtime one. The coverage that matters is on `src/core`, where the refresh, error
  // and validation logic lives.
  collectCoverageFrom: [
    'core/**/*.ts',
    '!core/__tests__/**',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
});
