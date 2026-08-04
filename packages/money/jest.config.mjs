import { createJestConfig, TOTAL_COVERAGE_THRESHOLD } from '@reliance/config/jest/base';

// The ledger's correctness rests on this package. Nothing less than total coverage.
export default createJestConfig({
  collectCoverageFrom: ['**/*.ts', '!index.ts'],
  coverageThreshold: TOTAL_COVERAGE_THRESHOLD,
});
