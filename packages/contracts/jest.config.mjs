import { createJestConfig } from '@reliance/config/jest/base';

export default createJestConfig({ coverageThreshold: { branches: 0, functions: 0, lines: 0, statements: 0 } });
