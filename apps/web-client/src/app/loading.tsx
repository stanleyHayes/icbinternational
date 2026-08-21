import { FullPageLoader } from '@/components/shell';

/**
 * The splash.
 *
 * Shown while the root segment resolves the session and decides whether this customer is going to
 * their accounts or to sign-in. It fills the viewport on purpose: a partial frame with an empty
 * middle reads as a screen that failed, and on an installed PWA — launched from a home-screen
 * icon, with no browser chrome to explain the wait — that is the whole window.
 *
 * The label says what is being waited for rather than "Loading", because that is what a screen
 * reader announces and "Loading" tells nobody anything.
 */
export default function Loading() {
  return <FullPageLoader label="Preparing your accounts" />;
}
