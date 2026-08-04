import { randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import {
  ACCOUNT_SERIAL_DIGITS,
  BANK_IDENTITY,
  MAX_IDENTIFIER_ALLOCATION_ATTEMPTS,
  SERIAL_UPPER_BOUND,
  type BankIdentity,
} from './account.constants.js';
import { AccountStore } from './account.store.js';
import { buildIban, domesticCheckDigits } from './iban.js';

/**
 * Mints the identifiers an account is known by: number, sort code and IBAN.
 *
 * The three are not independent. A Reliance account number is an eight-digit serial with
 * two ISO 7064 check digits appended, and its IBAN carries the same serial:
 *
 * ```
 * number  = 04871123  71                → "0487112371"
 *           └ serial┘  └ domestic check ┘
 * IBAN    = GB 42 RLNC 049921 04871123
 *           │  │  │    │      └ the same serial
 *           │  │  │    └ sort code
 *           │  │  └ bank code
 *           │  └ ISO 13616 check digits over everything that follows
 *           └ country
 * ```
 *
 * Deriving one from the other means the two can never disagree — the failure mode where
 * a customer's app shows one account number and their IBAN routes somewhere else simply
 * cannot occur. It also keeps the IBAN at the standard 22 characters for its country
 * while the domestic number stays the ten digits the contract specifies.
 *
 * The serial comes from `crypto.randomInt`, not a counter. A sequential account number
 * tells anyone who opens two accounts a fortnight apart exactly how many customers the
 * bank signed up in between.
 */
@Injectable()
export class AccountNumberService {
  constructor(
    private readonly accounts: AccountStore,
    @Inject(BANK_IDENTITY) private readonly bank: BankIdentity,
  ) {}

  /**
   * Allocates an unused set of identifiers.
   *
   * The uniqueness read is an optimisation, not the guarantee: two openings can pass it
   * microseconds apart, and the unique indexes on `number` and `iban` are what actually
   * arbitrate. The caller retries on a reported collision.
   *
   * @throws {AppError} `CONFLICT` if every attempt collided, which at eight tries against
   *   a hundred million serials means the space is genuinely exhausted.
   */
  async allocate(session?: ClientSession): Promise<AccountIdentifiers> {
    for (let attempt = 0; attempt < MAX_IDENTIFIER_ALLOCATION_ATTEMPTS; attempt += 1) {
      const candidate = this.mint();
      const taken = await this.accounts.findByNumber(candidate.number, session);
      if (!taken) return candidate;
    }

    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: 'Could not allocate an account number. Please try again.',
      context: { attempts: MAX_IDENTIFIER_ALLOCATION_ATTEMPTS },
    });
  }

  /** Builds one candidate set from a fresh random serial. Pure apart from the randomness. */
  mint(): AccountIdentifiers {
    return this.identifiersFor(randomSerial());
  }

  /**
   * The identifiers a given serial produces.
   *
   * Exposed so the derivation can be tested against known vectors, and so a seed can
   * reproduce a fixture account exactly.
   */
  identifiersFor(serial: string): AccountIdentifiers {
    const { countryCode, bankCode, sortCode } = this.bank;

    return {
      number: `${serial}${domesticCheckDigits(serial)}`,
      sortCode,
      iban: buildIban({ countryCode, bban: `${bankCode}${sortCode}${serial}` }),
    };
  }
}

/** The three identifiers an account carries, all derived from one serial. */
export interface AccountIdentifiers {
  /** Ten digits: an eight-digit serial plus its two-digit domestic check. */
  readonly number: string;
  readonly sortCode: string;
  readonly iban: string;
}

/** Extracts the serial an account number was built from. */
export function serialOf(accountNumber: string): string {
  return accountNumber.slice(0, ACCOUNT_SERIAL_DIGITS);
}

function randomSerial(): string {
  return String(randomInt(0, SERIAL_UPPER_BOUND)).padStart(ACCOUNT_SERIAL_DIGITS, '0');
}
