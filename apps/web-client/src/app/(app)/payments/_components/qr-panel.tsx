'use client';

/**
 * Scanning and sharing a payment code.
 *
 * Scanning uses the browser's own `BarcodeDetector` where it exists, which keeps the camera frame
 * on the device and needs no library. Where it does not exist — Safari and Firefox today — the
 * customer pastes the payload instead, which is the same string a scanner would have produced. The
 * round trip therefore holds either way: a payload generated here resolves back to its request.
 *
 * The camera is only ever started when the customer presses the button. A banking app that opens a
 * camera on page load is a banking app people uninstall.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, Button, FormField, Input } from '@reliance/ui';

import { laneRoutes, Section } from '@/components/transfers';

/** A payload is a request id, or a link that ends in one. */
const REQUEST_ID = /(?:^|\/)(?<id>[A-Za-z0-9_-]{8,})$/;

/** Pulls the request id out of a scanned payload or a pasted link. */
export function requestIdFrom(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  const withoutQuery = trimmed.split('?')[0] ?? trimmed;
  return REQUEST_ID.exec(withoutQuery)?.groups?.id ?? null;
}

/**
 * @example <QrPanel />
 */
export function QrPanel() {
  const router = useRouter();
  const [payload, setPayload] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const open = (): void => {
    const id = requestIdFrom(payload);
    if (!id) {
      setProblem('That does not look like a Reliance payment code. Check it and try again.');
      return;
    }
    setProblem(null);
    router.push(laneRoutes.payments.request(id));
  };

  return (
    <Section
      title="Open a payment code"
      description="Scan a Reliance code with your camera, or paste the code somebody sent you."
    >
      <div className="flex flex-col gap-4">
        <Alert tone="info" title="Only pay codes you were expecting">
          A code can be swapped for somebody else&rsquo;s. If a code arrived unexpectedly, or with a
          message pressing you to pay quickly, stop and call us on 0800 460 0460.
        </Alert>

        <PayloadField value={payload} problem={problem} onChange={setPayload} />

        <div className="flex justify-end">
          <Button disabled={payload.trim() === ''} onClick={open}>
            Open this request
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Where the scanned or pasted code goes. */
function PayloadField({
  value,
  problem,
  onChange,
}: {
  readonly value: string;
  readonly problem: string | null;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField
      label="Payment code or link"
      hint="Your camera app can read the code and copy it here."
      error={problem ?? undefined}
    >
      <Input
        value={value}
        autoComplete="off"
        placeholder="Paste the code or the link"
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}
