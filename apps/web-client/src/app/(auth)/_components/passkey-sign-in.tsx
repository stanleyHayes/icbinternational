'use client';

/**
 * Signing in with a passkey.
 *
 * Only rendered where the browser can actually run the ceremony. A button that opens a system
 * prompt and then fails teaches customers that passkeys do not work; not offering one on a device
 * that cannot use it teaches them nothing at all, which is the better outcome.
 */

import { Fingerprint } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@reliance/ui';

import { signInWithPasskey } from '@/lib/auth-client';
import { describeError } from '@/lib/errors';
import { passkeysAvailable, PasskeyError } from '@/lib/passkey';
import { useBrowserValue } from '@/lib/use-browser-value';

/** Props for {@link PasskeySignIn}. */
export interface PasskeySignInProps {
  /** Called once the bank has accepted the passkey and the session exists. */
  readonly onSignedIn: () => void;
  /** Surfaced by the parent screen, which owns the failure area. */
  readonly onFailure: (message: string) => void;
}

/** A "use a passkey" button, or nothing on a browser that cannot. */
export function PasskeySignIn({ onSignedIn, onFailure }: PasskeySignInProps) {
  const [busy, setBusy] = useState(false);

  // The server cannot know whether this browser has an authenticator, and guessing would either
  // hide the button from people who can use it or show it to people who cannot. It renders absent
  // and appears on hydration where it is genuinely usable.
  const supported = useBrowserValue(passkeysAvailable, false);

  if (!supported) return null;

  async function attempt(): Promise<void> {
    setBusy(true);
    try {
      await signInWithPasskey();
      onSignedIn();
    } catch (error) {
      onFailure(error instanceof PasskeyError ? error.message : describeError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth
      loading={busy}
      onClick={() => void attempt()}
      startIcon={<Fingerprint aria-hidden="true" className="size-4" />}
    >
      Use a passkey
    </Button>
  );
}
