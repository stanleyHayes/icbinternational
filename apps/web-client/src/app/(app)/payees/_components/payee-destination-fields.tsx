'use client';

/**
 * The account details for whichever kind of payee is being saved.
 *
 * The same three field blocks the send-money flow uses. "Between my accounts" is not offered here
 * — the customer's own accounts are already listed everywhere they matter, and saving one as a
 * payee would put a duplicate in the list that can never be deleted usefully.
 */

import {
  DomesticFields,
  InternationalFields,
  RelianceFields,
  TransferKind,
  type DestinationFieldsProps,
} from '@/components/transfers';

/**
 * @example <PayeeDestinationFields draft={draft} onChange={patch} errors={errors} />
 */
export function PayeeDestinationFields(props: DestinationFieldsProps) {
  if (props.draft.kind === TransferKind.RELIANCE) return <RelianceFields {...props} />;
  if (props.draft.kind === TransferKind.INTERNATIONAL) return <InternationalFields {...props} />;
  return <DomesticFields {...props} />;
}
