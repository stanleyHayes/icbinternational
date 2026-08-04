/**
 * An arrears position as the collections console renders it.
 *
 * The contract has no arrears shape — arrears are an internal view of a loan, not
 * something a customer's API returns — so this is the module's own. Amounts go out in the
 * same minor-unit wire form as everywhere else, so the admin app can render them with the
 * same money component and never has to parse a formatted string.
 */

import { type MoneyJSON } from '@reliance/money';

import { toWire } from '../../common/money/money.codec.js';

import { type ArrearsPosition, type DpdBucket } from './loan.types.js';

/** One row of the collections queue. */
export interface ArrearsView {
  readonly loanId: string;
  readonly userId: string;
  readonly daysPastDue: number;
  readonly bucket: DpdBucket;
  readonly arrearsAmount: MoneyJSON;
  readonly missedInstalments: number;
  /** Loss allowance the bucket calls for against this exposure. */
  readonly requiredProvision: MoneyJSON;
}

/** Maps one position onto its wire shape. */
export function toArrearsView(position: ArrearsPosition): ArrearsView {
  return {
    loanId: position.loanId,
    userId: position.userId,
    daysPastDue: position.daysPastDue,
    bucket: position.bucket,
    arrearsAmount: toWire(position.arrearsAmount),
    missedInstalments: position.missedInstalments,
    requiredProvision: toWire(position.requiredProvision),
  };
}
