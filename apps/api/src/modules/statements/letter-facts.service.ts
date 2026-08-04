/**
 * The facts a letter states, read from the ledger projection at the date it speaks of.
 *
 * A letter is an attestation, so every figure on one has to be the figure at the letter's
 * own date — not today's. Both readings therefore go through the recorded running balance
 * rather than through the account document, which only ever holds the current position.
 */

import { Injectable } from '@nestjs/common';

import { EntryType, TransactionDirection } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { fromStored } from '../../common/money/money.codec.js';
import { type AccountRecord } from '../accounts/index.js';
import { TransactionStore } from '../transactions/repositories/transaction.store.js';
import { TransactionRangeReader } from '../transactions/transaction-range.reader.js';

@Injectable()
export class LetterFactsService {
  constructor(
    private readonly transactions: TransactionStore,
    private readonly range: TransactionRangeReader,
  ) {}

  /**
   * The balance recorded against the account at the end of `asOf`.
   *
   * Read off the last posting on or before that instant, which is the figure the ledger
   * attested to at the time — recomputing it from today's balance backwards would be a
   * derivation, and a letter is not the place to derive anything.
   */
  async balanceAsOf(account: AccountRecord, asOf: Date): Promise<Money> {
    const previous = await this.transactions.latestBefore({
      userId: account.userId,
      accountId: account.id,
      before: new Date(asOf.getTime() + 1),
    });

    return previous ? fromStored(previous.runningBalance) : Money.zero(currencyOf(account));
  }

  /** Interest credited to the account, net of any reversed, over a window. */
  async interestBetween(account: AccountRecord, from: Date, to: Date): Promise<Money> {
    const records = await this.range.readAll({
      userId: account.userId,
      accountId: account.id,
      from,
      to,
    });

    let net = Money.zero(currencyOf(account));
    for (const record of records) {
      if (record.type !== EntryType.INTEREST_CREDIT && record.type !== EntryType.INTEREST_DEBIT) {
        continue;
      }
      const amount = fromStored(record.amount);
      net = record.direction === TransactionDirection.CREDIT ? net.plus(amount) : net.minus(amount);
    }

    return net;
  }
}

function currencyOf(account: AccountRecord): CurrencyCode {
  return account.currency as CurrencyCode;
}
