import { ErrorCode, FeeKind, TransferRail, TransferStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { GL } from '../../../domain/ledger/index.js';
import {
  gbp,
  productFixture,
  seedAccount,
  TEST_USER,
} from '../../accounts/__tests__/accounts-harness.js';
import { splitAroundFee } from '../transfer-rules.js';
import { QUOTE_TTL_MINUTES } from '../transfer.constants.js';

import { flatFee, gbpWire, transfersRig, type TransfersRig } from './transfers-harness.js';

const PAYEE_USER = 'usr_01JQ8Z0000000000000PAYEE3';
const STEP_UP = 'step-up-proof';
const ONE_MINUTE_MS = 60_000;

/** A product that charges a flat £2.50 on the domestic transfer schedule. */
const PRICED = productFixture({ fees: [flatFee(FeeKind.DOMESTIC_TRANSFER, '250')] });

async function scene(rig: TransfersRig) {
  const from = await seedAccount(rig.accounts, { ledger: gbp('100000') });
  const to = await seedAccount(rig.accounts, {
    userId: PAYEE_USER,
    holderIds: [PAYEE_USER],
    ledger: gbp('0'),
  });

  rig.stepUp.accept(TEST_USER, STEP_UP);
  rig.directory.register({
    userId: PAYEE_USER,
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
  });

  return { from, to };
}

describe('pricing a transfer', () => {
  it('returns an internal rail quote that expires', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('12345'),
        amountIsReceiveSide: false,
        chargeBearer: 'SHA',
      },
    });

    expect(quote.rail).toBe(TransferRail.INTERNAL);
    expect(quote.debitAmount).toEqual({ amount: '12345', currency: 'GBP' });
    expect(quote.creditAmount).toEqual({ amount: '12345', currency: 'GBP' });
    expect(quote.fee).toEqual({ amount: '0', currency: 'GBP' });
    expect(quote.exchangeRate).toBeNull();
    expect(Date.parse(quote.expiresAt)).toBe(
      rig.clock.timestamp() + QUOTE_TTL_MINUTES * ONE_MINUTE_MS,
    );
  });

  it('warns that charge options mean nothing inside the bank', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('1000'),
        amountIsReceiveSide: false,
        chargeBearer: 'OUR',
      },
    });

    expect(quote.warnings).toContain('Charge options do not apply to payments inside Reliance.');
  });

  it('refuses a rail this lane does not carry rather than faking it', async () => {
    const rig = transfersRig();
    const from = await seedAccount(rig.accounts, { ledger: gbp('100000') });

    await expect(
      rig.quotes.quote({
        userId: TEST_USER,
        request: {
          sourceAccountId: from,
          destination: {
            kind: 'DOMESTIC',
            accountName: 'Ada Lovelace',
            accountNumber: '1234567890',
            sortCode: '049921',
          },
          amount: gbpWire('1000'),
          amountIsReceiveSide: false,
          chargeBearer: 'SHA',
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FEATURE_DISABLED });
  });

  it('refuses a zero amount', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    await expect(
      rig.quotes.quote({
        userId: TEST_USER,
        request: {
          sourceAccountId: from,
          destination: { kind: 'INTERNAL', accountId: to },
          amount: gbpWire('0'),
          amountIsReceiveSide: false,
          chargeBearer: 'SHA',
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_AMOUNT });
  });

  it('refuses another customer’s source account without confirming it exists', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    await expect(
      rig.quotes.quote({
        userId: PAYEE_USER,
        request: {
          sourceAccountId: from,
          destination: { kind: 'INTERNAL', accountId: to },
          amount: gbpWire('1000'),
          amountIsReceiveSide: false,
          chargeBearer: 'SHA',
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_FOUND });
  });
});

describe('a priced transfer', () => {
  /**
   * The fee leg is exercised through a directly-stored quote, and that is deliberate.
   *
   * `FeeKind` has no `INTERNAL_TRANSFER` member, so the catalogue cannot price an internal
   * transfer and `feeKindFor(INTERNAL)` is honestly null — an internal transfer is free.
   * The booking code that posts the fee is shared with the rails that *are* priced (D-03,
   * D-04), so it is tested by binding to a quote that carries a fee, which is exactly what
   * those rails will produce. The missing enum member is logged in
   * `docs/CONTRACT_CHANGES.md`.
   */
  async function pricedQuote(rig: TransfersRig, from: string, to: string) {
    const now = rig.clock.now();

    return rig.quoteStore.insert({
      userId: TEST_USER,
      rail: TransferRail.INTERNAL,
      sourceAccountId: from,
      destination: { kind: 'INTERNAL', accountId: to },
      destinationAccountId: to,
      debitAmount: { amount: '10250', currency: 'GBP' },
      creditAmount: { amount: '10000', currency: 'GBP' },
      fee: { amount: '250', currency: 'GBP' },
      feeKind: FeeKind.DOMESTIC_TRANSFER,
      exchangeRate: null,
      rateExpiresAt: null,
      chargeBearer: 'SHA',
      requiresStepUp: false,
      warnings: [],
      estimatedArrival: now,
      cutOffAt: null,
      expiresAt: new Date(now.getTime() + QUOTE_TTL_MINUTES * ONE_MINUTE_MS),
      createdAt: now,
    });
  }

  it('books the fee as its own entry and takes both legs from the sender', async () => {
    const rig = transfersRig(PRICED);
    const { from, to } = await scene(rig);
    const quote = await pricedQuote(rig, from, to);

    const transfer = await rig.execute.execute({
      userId: TEST_USER,
      stepUpToken: STEP_UP,
      request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
    });

    expect(transfer.status).toBe(TransferStatus.SETTLED);
    expect(transfer.feeJournalEntryId).not.toBeNull();

    const feeEntry = await rig.ledger.entries.findByPublicId(transfer.feeJournalEntryId ?? '');
    expect(feeEntry?.type).toBe('FEE');
    expect(feeEntry?.postings.map((posting) => posting.ledgerAccountCode).sort()).toEqual([
      GL.CUSTOMER_DEPOSITS,
      GL.FEE_INCOME,
    ]);

    // Transfer leg plus fee leg is the whole debit; the payee receives only the credit.
    expect((await rig.balances.snapshot(from)).ledger.amount.toString()).toBe('89750');
    expect((await rig.balances.snapshot(to)).ledger.amount.toString()).toBe('10000');

    // The allowance is burned inside the payment's transaction, once.
    expect(rig.fees.charged).toEqual([`${from}:${FeeKind.DOMESTIC_TRANSFER}`]);
    expect(rig.projector.projected).toHaveLength(2);
  });

  it('prices an internal transfer at nothing, because the catalogue cannot price it', async () => {
    const rig = transfersRig(PRICED);
    const { from, to } = await scene(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('10000'),
        amountIsReceiveSide: true,
        chargeBearer: 'SHA',
      },
    });

    expect(quote.fee).toEqual({ amount: '0', currency: 'GBP' });
    expect(quote.debitAmount).toEqual(quote.creditAmount);
  });
});

describe('the fee split', () => {
  const fee = Money.fromMinor('250', 'GBP');
  const amount = Money.fromMinor('10000', 'GBP');

  it('adds the fee on top when the payee must receive the full amount', () => {
    const split = splitAroundFee({ amount, fee, amountIsReceiveSide: true });
    expect(split.debitAmount.amount).toBe(10_250n);
    expect(split.creditAmount.amount).toBe(10_000n);
  });

  it('takes the fee out of the amount otherwise', () => {
    const split = splitAroundFee({ amount, fee, amountIsReceiveSide: false });
    expect(split.debitAmount.amount).toBe(10_000n);
    expect(split.creditAmount.amount).toBe(9_750n);
  });

  it('leaves the two sides equal when there is no fee', () => {
    const split = splitAroundFee({
      amount,
      fee: Money.zero('GBP'),
      amountIsReceiveSide: false,
    });
    expect(split.debitAmount.equals(split.creditAmount)).toBe(true);
  });
});
