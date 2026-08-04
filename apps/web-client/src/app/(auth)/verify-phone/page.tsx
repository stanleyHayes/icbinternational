import type { Metadata } from 'next';

import { VerifyPhoneForm } from './verify-phone-form';

export const metadata: Metadata = {
  title: 'Confirm your mobile number',
  description: 'Confirm the mobile number on your Reliance Bank account.',
};

/** Confirming a mobile number. */
export default function VerifyPhonePage() {
  return <VerifyPhoneForm />;
}
