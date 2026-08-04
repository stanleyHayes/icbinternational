/**
 * What each letter actually says.
 *
 * The copy lives apart from the renderer because it is the part a compliance reviewer
 * reads, and it should be readable without a PDF library in the way. Every sentence
 * states something the bank can point at in its own records — a balance it recorded, an
 * address it verified, a date an account was opened. Nothing here characterises the
 * customer or predicts anything, because a letter that does is a letter the bank cannot
 * stand behind.
 */

import { LetterKind } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type AccountRecord } from '../accounts/index.js';

import { formatAddress, type CustomerIdentity } from './customer-identity.service.js';
import { LETTER_VALIDITY_DAYS } from './statements.constants.js';

/** Everything the copy is allowed to draw on. */
export interface LetterFacts {
  readonly bank: string;
  readonly identity: CustomerIdentity;
  readonly account: AccountRecord;
  readonly balance: Money;
  readonly interest: Money;
  readonly asOfDay: string;
  readonly openedDay: string;
  readonly reference: string;
  readonly addressedTo: string | null;
}

const TITLES: Readonly<Record<LetterKind, string>> = {
  [LetterKind.PROOF_OF_BALANCE]: 'Confirmation of balance',
  [LetterKind.PROOF_OF_ADDRESS]: 'Confirmation of address',
  [LetterKind.BANK_REFERENCE]: 'Bank reference',
  [LetterKind.ACCOUNT_CONFIRMATION]: 'Confirmation of account',
  [LetterKind.INTEREST_CERTIFICATE]: 'Certificate of interest',
};

export function letterTitle(kind: LetterKind): string {
  return TITLES[kind];
}

/** How the letter opens: the named recipient, or the customary form when there is none. */
export function salutation(addressedTo: string | null): string {
  return addressedTo ? `Dear ${addressedTo}` : 'To whom it may concern';
}

/** The body, one paragraph per entry. */
export function letterBody(kind: LetterKind, facts: LetterFacts): string[] {
  switch (kind) {
    case LetterKind.PROOF_OF_BALANCE: {
      return balanceCopy(facts);
    }
    case LetterKind.PROOF_OF_ADDRESS: {
      return addressCopy(facts);
    }
    case LetterKind.BANK_REFERENCE: {
      return referenceCopy(facts);
    }
    case LetterKind.INTEREST_CERTIFICATE: {
      return interestCopy(facts);
    }
    default: {
      return accountCopy(facts);
    }
  }
}

/** The two lines every letter closes with. */
export function letterClosing(facts: LetterFacts): string[] {
  return [
    `Issued by ${facts.bank} on ${facts.asOfDay}. Our reference is ${facts.reference}.`,
    `This letter states our records as at the date shown and is intended to be relied on for ${LETTER_VALIDITY_DAYS} days from that date.`,
  ];
}

function balanceCopy(facts: LetterFacts): string[] {
  return [
    `We confirm that ${facts.identity.name} holds the account described below with ${facts.bank}, and that the balance standing to the credit of that account at the close of ${facts.asOfDay} was ${facts.balance.format()}.`,
    'This confirms the balance recorded in our books at that date. It is not a guarantee of funds and does not commit us to any future balance.',
  ];
}

function addressCopy(facts: LetterFacts): string[] {
  const address = facts.identity.address;
  const lines = address ? formatAddress(address).join(', ') : '';

  return [
    `We confirm that the address held on our records for ${facts.identity.name}, the holder of the account described below, is ${lines}.`,
    "This is the address recorded against the customer's verified identity and the address to which we send correspondence.",
  ];
}

function referenceCopy(facts: LetterFacts): string[] {
  return [
    `We confirm that ${facts.identity.name} has held the account described below with ${facts.bank} since ${facts.openedDay}, and that the account is open and operating normally.`,
    'This reference is given at the request of our customer, in confidence, and without responsibility on the part of the bank or any of its officers.',
  ];
}

function interestCopy(facts: LetterFacts): string[] {
  return [
    `We certify that interest of ${facts.interest.format()} was credited to the account described below in the twelve months ending ${facts.asOfDay}.`,
    "This certificate is issued for the customer's own tax records. Interest is shown gross of any tax the customer may owe on it.",
  ];
}

function accountCopy(facts: LetterFacts): string[] {
  return [
    `We confirm that the account described below is held with ${facts.bank} in the name of ${facts.identity.name}, and that the details shown are the correct details for payments to that account.`,
    `The account has been open since ${facts.openedDay}.`,
  ];
}

/** The account block that appears under the body of every letter. */
export function accountFacts(account: AccountRecord): (readonly [string, string])[] {
  return [
    ['Account name', account.nickname ?? account.productName],
    ['Account number', account.number],
    ['Sort code', account.sortCode],
    ['IBAN', account.iban],
    ['Currency', account.currency],
  ];
}
