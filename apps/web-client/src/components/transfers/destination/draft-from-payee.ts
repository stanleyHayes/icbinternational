'use client';

/**
 * Turning a saved payee back into a form.
 *
 * "Pay them again" has to fill every field the rail needs, including the ones the customer never
 * sees again — the BIC on an international payee, the sort code on a domestic one. Rebuilding the
 * draft from the stored destination is what makes a repeat payment a two-tap job rather than a
 * retype of an IBAN.
 */

import type { TransferDestination } from '@reliance/contracts';

import { EMPTY_DRAFT, TransferKind, type DestinationDraft } from './destination-draft';

function fromInternal(
  destination: Extract<TransferDestination, { kind: 'INTERNAL' }>,
  payeeId: string,
): DestinationDraft {
  return {
    ...EMPTY_DRAFT,
    payeeId,
    kind: TransferKind.RELIANCE,
    relianceRef: destination.accountNumber ?? destination.handle ?? destination.email ?? '',
  };
}

function fromDomestic(
  destination: Extract<TransferDestination, { kind: 'DOMESTIC' }>,
  payeeId: string,
): DestinationDraft {
  return {
    ...EMPTY_DRAFT,
    payeeId,
    kind: TransferKind.DOMESTIC,
    accountName: destination.accountName,
    accountNumber: destination.accountNumber,
    sortCode: destination.sortCode,
    bankName: destination.bankName ?? '',
  };
}

function fromInternational(
  destination: Extract<TransferDestination, { kind: 'INTERNATIONAL' }>,
  payeeId: string,
): DestinationDraft {
  return {
    ...EMPTY_DRAFT,
    payeeId,
    kind: TransferKind.INTERNATIONAL,
    accountName: destination.accountName,
    iban: destination.iban,
    bic: destination.bic,
    bankName: destination.bankName,
    country: destination.country,
  };
}

/** Fills a draft from a saved payee, so a repeat payment needs no retyping. */
export function draftFromPayee(
  destination: TransferDestination,
  payeeId: string,
): DestinationDraft {
  if (destination.kind === 'INTERNAL') return fromInternal(destination, payeeId);
  if (destination.kind === 'DOMESTIC') return fromDomestic(destination, payeeId);
  return fromInternational(destination, payeeId);
}
