import userEvent from '@testing-library/user-event';

/**
 * `userEvent`, set up the way this app's tests want it.
 *
 * The default setup awaits a real timer between every keystroke. That is right for a test
 * observing a debounce and wrong for one that simply needs a field filled in: typing
 * becomes a sequence of macrotasks, and with the whole monorepo's test tasks running at
 * once it can exceed Jest's five-second budget. The suite then fails on scheduling rather
 * than behaviour, and a timeout mid-typing leaves characters behind for the next test to
 * append to — so one slow test reports as two unrelated failures.
 *
 * `delay: null` dispatches synchronously. A test that genuinely needs the gap between
 * keystrokes should call `userEvent.setup()` itself and say why.
 *
 * Deliberately local rather than shared: `@reliance/testing` is a Node-side harness built
 * around Mongo and the contract builders, and giving it a DOM dependency so three packages
 * can share two lines is the worse trade.
 */
export function setupUser(): ReturnType<typeof userEvent.setup> {
  return userEvent.setup({ delay: null });
}
