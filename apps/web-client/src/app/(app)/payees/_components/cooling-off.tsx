'use client';

/**
 * The cooling-off window, explained rather than merely enforced.
 *
 * New payees are held back from large payments for a day. Customers meet this as a refusal at the
 * worst possible moment unless somebody tells them first, so it is stated on the payee the moment
 * it is created, with the time it ends and — more importantly — the reason.
 *
 * The reason is not "policy". It is that the overwhelming majority of authorised push-payment
 * fraud happens within minutes of a payee being added, under pressure, on the phone. A day is
 * enough for that pressure to break.
 */

import type { Beneficiary } from '@reliance/contracts';
import { Alert, Badge } from '@reliance/ui';

import { nowMs } from '@/lib/clock';
import { formatDateTime } from '@/lib/format';

/** True while the bank is still holding this payee back from large payments. */
export function inCoolingOff(payee: Beneficiary): boolean {
  return payee.trustedFrom !== null && new Date(payee.trustedFrom).getTime() > nowMs();
}

/** The short marker used in a list row. */
export function CoolingOffBadge({ payee }: { readonly payee: Beneficiary }) {
  if (!inCoolingOff(payee)) return null;

  return (
    <Badge tone="pending" className="shrink-0">
      New payee
    </Badge>
  );
}

/** Props for {@link CoolingOffNotice}. */
export interface CoolingOffNoticeProps {
  readonly payee: Beneficiary;
}

/**
 * @example <CoolingOffNotice payee={payee} />
 */
export function CoolingOffNotice({ payee }: CoolingOffNoticeProps) {
  if (!inCoolingOff(payee) || !payee.trustedFrom) return null;

  return (
    <Alert tone="info" title="Larger payments to this payee open up shortly">
      <p>
        You can send smaller amounts straight away. Payments above your new-payee limit will go
        through from {formatDateTime(payee.trustedFrom)}.
      </p>
      <p className="mt-2">
        We hold new payees back for a short while because most payment scams happen within minutes
        of someone being talked into adding one. If anybody is pressing you to send money now, that
        is the moment to stop and call us on 0800 460 0460.
      </p>
    </Alert>
  );
}
