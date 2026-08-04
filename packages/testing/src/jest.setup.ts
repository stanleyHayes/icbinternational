/**
 * Jest setup entry — register the Reliance matchers for a suite.
 *
 * Consumers add one line to their Jest config:
 *
 * ```js
 * export default createJestConfig({
 *   setupFilesAfterEnv: ['@reliance/testing/jest.setup'],
 * });
 * ```
 */

import { relianceMatchers } from './matchers/register-matchers.js';

expect.extend(relianceMatchers);
