import type { Metadata } from 'next';

import { LockedPanel } from './locked-panel';

export const metadata: Metadata = {
  title: 'This account is locked',
  description: 'What to do if your Reliance Bank account has been locked.',
};

/**
 * Lockout.
 *
 * A screen rather than an inline message, because being locked out of a bank account is not a form
 * error — it needs room to explain what happened, what to do, and that the money is untouched.
 */
export default function AccountLockedPage() {
  return <LockedPanel />;
}
