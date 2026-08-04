/**
 * A facility as the customer's account page shows it.
 *
 * The drawn amount is derived from the account's ledger balance rather than stored on the
 * facility, so the two can never disagree. Everything the customer is shown — used,
 * available, utilisation, what today costs — falls out of that one number and the limit.
 */

import { type Money } from '@reliance/money';

import { fromStored, toWire } from '../../common/money/money.codec.js';

import { dailyInterest, utilisationOf } from './overdraft-pricing.js';
import { type OverdraftFacility } from './overdraft.dto.js';
import { type OverdraftRecord } from './overdraft.store.js';

/** Maps one facility, priced against the account's current balance. */
export function toOverdraftFacility(input: {
  facility: OverdraftRecord;
  ledgerBalance: Money;
}): OverdraftFacility {
  const limit = fromStored(input.facility.limit);
  const utilisation = utilisationOf(input.ledgerBalance, limit);

  return {
    id: input.facility.id,
    accountId: input.facility.accountId,
    status: input.facility.status,
    limit: toWire(limit),
    used: toWire(utilisation.used),
    available: toWire(utilisation.headroom),
    utilisationBps: utilisation.utilisationBps,
    aprBps: input.facility.aprBps,
    dailyInterest: toWire(dailyInterest(utilisation)),
    interestChargedToDate: toWire(fromStored(input.facility.interestChargedToDate)),
    sweepFromAccountId: input.facility.sweepFromAccountId,
    declineReasons: [...input.facility.declineReasons],
    requestedAt: input.facility.requestedAt.toISOString(),
    decidedAt: input.facility.decidedAt ? input.facility.decidedAt.toISOString() : null,
  };
}
