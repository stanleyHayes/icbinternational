/**
 * Bans floating-point arithmetic in code paths that handle money.
 *
 * `0.1 + 0.2 !== 0.3`. In a ledger that is not a curiosity, it is a defect that
 * compounds. All monetary values in Reliance Bank are `bigint` minor units wrapped
 * in the `Money` value object from `@reliance/money`.
 *
 * Flags:
 *  - fractional numeric literals (`1.5`, `0.075`)
 *  - `parseFloat` / `Number.parseFloat`
 *  - `.toFixed(...)`
 */

const FRACTIONAL_LITERAL = /^\d*\.\d+([eE][+-]?\d+)?$/;

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow floating-point numbers and float coercion in money-handling code',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedLiterals: { type: 'array', items: { type: 'number' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      fractionalLiteral:
        'Fractional literal `{{value}}` is not allowed here. Money is bigint minor units — use `Money.fromMinor()` or a named non-monetary constant in a dedicated constants file.',
      parseFloat:
        '`parseFloat` produces a lossy float. Use `Money.parse()` or `BigInt()` on a validated string.',
      toFixed:
        '`toFixed` rounds a float and hides precision loss. Use `Money.format()` for display.',
    },
  },

  create(context) {
    const [{ allowedLiterals = [] } = {}] = context.options;
    const allowed = new Set(allowedLiterals);

    /** @param {import('estree').Node} node */
    const isParseFloatCallee = (node) =>
      (node.type === 'Identifier' && node.name === 'parseFloat') ||
      (node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'Number' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'parseFloat');

    return {
      Literal(node) {
        if (typeof node.value !== 'number') return;
        if (allowed.has(node.value)) return;
        if (!FRACTIONAL_LITERAL.test(String(node.raw ?? node.value))) return;

        context.report({ node, messageId: 'fractionalLiteral', data: { value: String(node.raw) } });
      },

      CallExpression(node) {
        if (isParseFloatCallee(node.callee)) {
          context.report({ node, messageId: 'parseFloat' });
          return;
        }

        const { callee } = node;
        const isToFixed =
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'toFixed';

        if (isToFixed) context.report({ node, messageId: 'toFixed' });
      },
    };
  },
};

export default rule;
