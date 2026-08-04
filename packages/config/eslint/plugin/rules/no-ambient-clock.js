/**
 * Bans ambient reads of wall-clock time inside the banking core.
 *
 * Reliance Bank runs on a simulated clock: the operations console can advance time
 * by a month to exercise interest accrual, statement generation and arrears. Any
 * code that calls `new Date()` or `Date.now()` directly escapes that clock and
 * silently produces wrong results during simulation.
 *
 * Inject `ClockService` and call `clock.now()` instead.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct wall-clock access; require the injectable ClockService',
      recommended: true,
    },
    schema: [],
    messages: {
      newDate:
        '`new Date()` bypasses the simulated clock. Inject `ClockService` and call `clock.now()`.',
      dateNow:
        '`Date.now()` bypasses the simulated clock. Inject `ClockService` and call `clock.timestamp()`.',
      performanceNow:
        '`performance.now()` is for measuring durations only — if you need a wall-clock instant, use `ClockService`.',
    },
  },

  create(context) {
    return {
      NewExpression(node) {
        const isBareDate =
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Date' &&
          node.arguments.length === 0;

        if (isBareDate) context.report({ node, messageId: 'newDate' });
      },

      'CallExpression > MemberExpression'(node) {
        if (node.object.type !== 'Identifier' || node.property.type !== 'Identifier') return;

        if (node.object.name === 'Date' && node.property.name === 'now') {
          context.report({ node: node.parent, messageId: 'dateNow' });
        }
      },
    };
  },
};

export default rule;
