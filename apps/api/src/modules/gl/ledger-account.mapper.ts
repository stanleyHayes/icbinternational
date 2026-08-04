import { type LedgerAccount } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type GlChartAccountDocument } from './schemas/ledger-account.schema.js';

/**
 * Document → contract mapping.
 *
 * The balance is supplied by the caller because it is a projection of the postings, not
 * a field on the document — the mapper's job is only to keep every read of the collection
 * in the same wire shape.
 */
export function toLedgerAccount(document: GlChartAccountDocument, balance: Money): LedgerAccount {
  return {
    id: document.id,
    code: document.code,
    name: document.name,
    type: document.type,
    isControlAccount: document.isControlAccount,
    balance: balance.toJSON(),
  };
}
