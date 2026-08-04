'use client';

/**
 * "Should we remember this device?"
 *
 * Asked at the second-factor step rather than on the sign-in form, because this is the first
 * moment the customer has actually proved who they are — offering to trust a browser before that
 * would be offering to trust whoever is typing.
 *
 * It names the device it is talking about. "Remember this device" on a shared machine in a library
 * is a decision people make wrongly when they cannot see what they are agreeing to.
 */

import { ShieldCheck } from 'lucide-react';

import { Checkbox } from '@reliance/ui';

import { deviceLabel } from '@/lib/device';
import { useBrowserValue } from '@/lib/use-browser-value';

/** Props for {@link DeviceTrustPrompt}. */
export interface DeviceTrustPromptProps {
  readonly checked: boolean;
  readonly onChange: (trusted: boolean) => void;
}

/** A labelled opt-in to skipping the second factor on this browser in future. */
export function DeviceTrustPrompt({ checked, onChange }: DeviceTrustPromptProps) {
  // The user agent is not available during the server render, so the neutral phrase is what the
  // HTML carries and the specific one arrives with hydration.
  const label = useBrowserValue(deviceLabel, 'this device');

  return (
    <div className="border-border bg-canvas flex gap-3 rounded-lg border p-4">
      <ShieldCheck aria-hidden="true" className="text-accent mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
          <span className="text-sm font-medium">Remember {label} for 30 days</span>
        </Checkbox>
        <p className="text-fg-muted mt-1 text-sm">
          We will not ask for a code again on this browser. Leave it unticked on a shared or public
          computer.
        </p>
      </div>
    </div>
  );
}
