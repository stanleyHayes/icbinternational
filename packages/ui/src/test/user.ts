import userEvent from '@testing-library/user-event';

/**
 * `userEvent`, set up the way this package's tests want it.
 *
 * The default setup awaits a real timer between every keystroke. That is the right default
 * for a test observing a debounce, and the wrong one for the twenty-seven tests here that
 * simply need six digits in a field: typing an amount becomes a sequence of macrotasks, and
 * on a machine running the whole monorepo's test tasks at once it can exceed Jest's
 * five-second budget. The suite then fails on scheduling rather than on behaviour — and
 * worse, a timeout mid-typing leaves characters in the field that the *next* test then
 * appends to, so one slow test reports as two unrelated failures.
 *
 * `delay: null` dispatches the events synchronously. Nothing here depends on the gap
 * between keystrokes; a test that does should call `userEvent.setup()` itself and say why.
 */
export function setupUser(): ReturnType<typeof userEvent.setup> {
  return userEvent.setup({ delay: null });
}
