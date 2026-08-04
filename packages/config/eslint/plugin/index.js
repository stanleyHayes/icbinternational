/**
 * `eslint-plugin-reliance` — house rules that encode the two invariants no generic
 * linter knows about: money is never a float, and time is never ambient.
 */
import noFloatMoney from './rules/no-float-money.js';
import noAmbientClock from './rules/no-ambient-clock.js';

/** @type {import('eslint').ESLint.Plugin} */
const reliancePlugin = {
  meta: {
    name: 'eslint-plugin-reliance',
    version: '1.0.0',
  },
  rules: {
    'no-float-money': noFloatMoney,
    'no-ambient-clock': noAmbientClock,
  },
};

export default reliancePlugin;
