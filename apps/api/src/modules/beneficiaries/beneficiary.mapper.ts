import { type Beneficiary } from '@reliance/contracts';

import { toIso } from '../accounts/index.js';

import { type BeneficiaryRecord } from './beneficiary.store.js';

/**
 * Persisted payee to the wire shape.
 *
 * `matchKeys` and `userId` are deliberately not projected. The keys are an internal index
 * over identifiers the customer already supplied, and echoing the owner's id back to the
 * owner tells them nothing while giving a future bug a way to leak it.
 */
export function toContractBeneficiary(record: BeneficiaryRecord): Beneficiary {
  return {
    id: record.id,
    nickname: record.nickname,
    destination: record.destination,
    currency: record.currency as Beneficiary['currency'],
    nameCheck: record.nameCheck,
    nameCheckSuggestion: record.nameCheckSuggestion,
    isFavourite: record.isFavourite,
    trustedFrom: toIso(record.trustedFrom),
    lastUsedAt: record.lastUsedAt ? toIso(record.lastUsedAt) : null,
    createdAt: toIso(record.createdAt),
  };
}
