import { EntryType, ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { EntryBuilder, GL, movementEntries } from '../../../domain/ledger/index.js';
import { aggregateCustomerEffects, aggregateLedgerEffects } from '../posting-effects.js';
import { assertControlAccountsRespected } from '../posting-rules.js';

import {
  TEST_BOOKED_AT,
  TEST_VALUE_DATE,
  testAccountId,
  transferEntry,
} from './ledger-test.helpers.js';

const GBP = 'GBP';

function builderFor(type: EntryType): EntryBuilder {
  return EntryBuilder.for({
    reference: 'RULE-1',
    type,
    description: 'Rule probe',
    valueDate: TEST_VALUE_DATE,
    bookedAt: TEST_BOOKED_AT,
  });
}

describe('assertControlAccountsRespected', () => {
  it('accepts an ordinary internal transfer', () => {
    const entry = transferEntry({
      reference: 'OK-1',
      fromAccountId: testAccountId('A'),
      toAccountId: testAccountId('B'),
      amount: Money.fromMinor(500, GBP),
    });

    expect(() => assertControlAccountsRespected(entry)).not.toThrow();
  });

  it('refuses a posting to GL 2000 that names no customer account', () => {
    const entry = builderFor(EntryType.INTERNAL_TRANSFER)
      .debitLedger(GL.CUSTOMER_DEPOSITS, Money.fromMinor(100, GBP), 'orphan leg')
      .creditLedger(GL.NOSTRO_CLEARING, Money.fromMinor(100, GBP), 'counterparty')
      .build();

    expect(() => assertControlAccountsRespected(entry)).toThrow(AppError);
    try {
      assertControlAccountsRespected(entry);
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('refuses a manual adjustment that touches a control account', () => {
    const entry = builderFor(EntryType.MANUAL_ADJUSTMENT)
      .debitLedger(GL.TERM_DEPOSITS, Money.fromMinor(100, GBP), 'manual term move')
      .creditLedger(GL.NOSTRO_CLEARING, Money.fromMinor(100, GBP), 'counterparty')
      .build();

    try {
      assertControlAccountsRespected(entry);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('allows a non-manual posting to a control account with a subsidiary ledger', () => {
    const entry = builderFor(EntryType.DEPOSIT_PLACEMENT)
      .debitLedger(GL.NOSTRO_CLEARING, Money.fromMinor(100, GBP), 'funding')
      .creditLedger(GL.TERM_DEPOSITS, Money.fromMinor(100, GBP), 'term placement')
      .build();

    expect(() => assertControlAccountsRespected(entry)).not.toThrow();
  });
});

describe('aggregateLedgerEffects', () => {
  it('merges legs that touch the same account twice', () => {
    // An outbound transfer with a fee debits the same customer twice: the two legs on
    // GL 2000 must collapse into one write of their sum.
    const entry = movementEntries.outboundTransfer({
      reference: 'AGG-1',
      fromAccountId: testAccountId('A'),
      amount: Money.fromMinor(300, GBP),
      fee: Money.fromMinor(25, GBP),
      type: EntryType.DOMESTIC_TRANSFER,
      description: 'merged legs',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
    });

    const effects = aggregateLedgerEffects(entry.postings);
    const deposits = effects.find((effect) => effect.target === GL.CUSTOMER_DEPOSITS);

    expect(deposits?.delta.amount).toBe(-325n);
  });

  it('drops zero-net movements entirely', () => {
    const entry = transferEntry({
      reference: 'AGG-2',
      fromAccountId: testAccountId('A'),
      toAccountId: testAccountId('B'),
      amount: Money.fromMinor(300, GBP),
    });

    expect(aggregateLedgerEffects(entry.postings)).toHaveLength(0);
  });
});

describe('aggregateCustomerEffects', () => {
  it('skips pure general-ledger legs', () => {
    const entry = builderFor(EntryType.DOMESTIC_TRANSFER)
      .debitLedger(GL.UNSETTLED_OUTBOUND, Money.fromMinor(100, GBP), 'settled')
      .creditLedger(GL.NOSTRO_CLEARING, Money.fromMinor(100, GBP), 'settled')
      .build();

    expect(aggregateCustomerEffects(entry.postings)).toHaveLength(0);
  });

  it('produces a signed delta per account and currency', () => {
    const from = testAccountId('FROM');
    const to = testAccountId('TO');
    const entry = transferEntry({
      reference: 'AGG-3',
      fromAccountId: from,
      toAccountId: to,
      amount: Money.fromMinor(250, GBP),
    });

    const effects = aggregateCustomerEffects(entry.postings);
    const byTarget = new Map(effects.map((effect) => [effect.target, effect.delta.amount]));

    expect(byTarget.get(from)).toBe(-250n);
    expect(byTarget.get(to)).toBe(250n);
  });
});
