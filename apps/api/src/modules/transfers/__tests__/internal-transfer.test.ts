import { AccountStatus, ErrorCode, TransferStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { GL } from '../../../domain/ledger/index.js';
import {
  gbp,
  productFixture,
  seedAccount,
  TEST_USER,
} from '../../accounts/__tests__/accounts-harness.js';

import { gbpWire, transfersRig, type TransfersRig } from './transfers-harness.js';

const PAYEE_USER = 'usr_01JQ8Z0000000000000PAYEE1';

/**
 * The step-up proof every test presents.
 *
 * A first payment to a payee the customer has never used always demands one — see
 * `cooling-off.ts` — so a test that omitted it would be testing the step-up rule rather
 * than the thing it is about. The rule itself is tested explicitly in `step-up.test.ts`.
 */
const STEP_UP = 'step-up-proof';

/** Two funded accounts held by two different customers. */
async function twoParties(rig: TransfersRig, senderBalance = '100000') {
  const from = await seedAccount(rig.accounts, { ledger: gbp(senderBalance) });
  const to = await seedAccount(rig.accounts, {
    userId: PAYEE_USER,
    holderIds: [PAYEE_USER],
    ledger: gbp('0'),
  });

  rig.stepUp.accept(TEST_USER, STEP_UP);
  rig.directory.register({
    userId: PAYEE_USER,
    email: 'ada@example.com',
    handle: '@ada',
    displayName: 'Ada Lovelace',
  });

  return { from, to };
}

/** Quotes and immediately executes, which is what a customer's two taps amount to. */
async function send(
  rig: TransfersRig,
  options: { from: string; to: string; minor: string; save?: boolean },
) {
  const quote = await rig.quotes.quote({
    userId: TEST_USER,
    request: {
      sourceAccountId: options.from,
      destination: { kind: 'INTERNAL', accountId: options.to },
      amount: gbpWire(options.minor),
      amountIsReceiveSide: false,
      chargeBearer: 'SHA',
    },
  });

  return rig.execute.execute({
    userId: TEST_USER,
    stepUpToken: STEP_UP,
    request: {
      quoteId: quote.id,
      saveBeneficiary: options.save ?? false,
      metadata: {},
    },
  });
}

describe('an internal transfer', () => {
  it('moves exactly the right amount and books one balanced journal entry', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const transfer = await send(rig, { from, to, minor: '25000' });

    expect(transfer.status).toBe(TransferStatus.SETTLED);
    expect(transfer.debitAmount.amount).toBe('25000');
    expect(transfer.creditAmount.amount).toBe('25000');

    const sender = await rig.balances.snapshot(from);
    const payee = await rig.balances.snapshot(to);
    expect(sender.ledger.amount.toString()).toBe('75000');
    expect(payee.ledger.amount.toString()).toBe('25000');

    const entry = await rig.ledger.entries.findByPublicId(transfer.journalEntryId ?? '');
    expect(entry?.postings).toHaveLength(2);
    expect(
      entry?.postings.every((posting) => posting.ledgerAccountCode === GL.CUSTOMER_DEPOSITS),
    ).toBe(true);

    const debits = sumOf(entry?.postings ?? [], 'DEBIT');
    const credits = sumOf(entry?.postings ?? [], 'CREDIT');
    expect(debits).toBe(credits);
  });

  it('records both sides on one entry, so no instant shows the money nowhere', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const transfer = await send(rig, { from, to, minor: '10000' });
    const entry = await rig.ledger.entries.findByPublicId(transfer.journalEntryId ?? '');

    expect(entry?.postings.map((posting) => posting.accountId).sort()).toEqual([from, to].sort());
    expect(rig.projector.projected).toEqual([{ entryId: entry?.id, hadSession: true }]);
  });

  it('leaves the money and the timeline consistent', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const transfer = await send(rig, { from, to, minor: '5000' });

    expect(transfer.timeline.map((event) => event.status)).toEqual([
      TransferStatus.SUBMITTED,
      TransferStatus.SETTLED,
    ]);
    expect(transfer.settledAt).not.toBeNull();
  });
});

describe('executing the same quote twice', () => {
  it('produces one journal entry and one debit', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('30000'),
        amountIsReceiveSide: false,
        chargeBearer: 'SHA',
      },
    });

    const request = { quoteId: quote.id, saveBeneficiary: false, metadata: {} };
    const authorised = { userId: TEST_USER, stepUpToken: STEP_UP, request };
    const first = await rig.execute.execute(authorised);
    const second = await rig.execute.execute(authorised);

    expect(second.id).toBe(first.id);
    expect(second.journalEntryId).toBe(first.journalEntryId);

    const sender = await rig.balances.snapshot(from);
    expect(sender.ledger.amount.toString()).toBe('70000');
    expect(rig.projector.projected).toHaveLength(1);
  });
});

describe('refusals', () => {
  it('rejects insufficient funds before any write', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig, '4000');

    await expect(send(rig, { from, to, minor: '9000' })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_FUNDS,
    });

    const sender = await rig.balances.snapshot(from);
    const payee = await rig.balances.snapshot(to);
    expect(sender.ledger.amount.toString()).toBe('4000');
    expect(payee.ledger.amount.toString()).toBe('0');
    expect(rig.projector.projected).toHaveLength(0);
    await expect(rig.transferStore.list({ userId: TEST_USER, limit: 10 })).resolves.toMatchObject({
      data: [],
    });
  });

  it('refuses a self-transfer', async () => {
    const rig = transfersRig();
    const from = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await expect(send(rig, { from, to: from, minor: '100' })).rejects.toMatchObject({
      code: ErrorCode.SAME_ACCOUNT_TRANSFER,
    });
  });

  it('refuses a frozen source account', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);
    await rig.accounts.patch({ accountId: from, fields: { status: AccountStatus.FROZEN } });

    await expect(send(rig, { from, to, minor: '100' })).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_FROZEN,
    });
  });

  it('refuses a frozen payee account', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);
    await rig.accounts.patch({ accountId: to, fields: { status: AccountStatus.FROZEN } });

    await expect(send(rig, { from, to, minor: '100' })).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_FROZEN,
    });
  });

  it('cannot execute an expired quote', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('1000'),
        amountIsReceiveSide: false,
        chargeBearer: 'SHA',
      },
    });

    rig.clock.advance(ONE_HOUR_MS);

    await expect(
      rig.execute.execute({
        userId: TEST_USER,
        stepUpToken: STEP_UP,
        request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.QUOTE_EXPIRED });

    const sender = await rig.balances.snapshot(from);
    expect(sender.ledger.amount.toString()).toBe('100000');
  });

  it('refuses another customer’s quote without revealing it exists', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('1000'),
        amountIsReceiveSide: false,
        chargeBearer: 'SHA',
      },
    });

    await expect(
      rig.execute.execute({
        userId: PAYEE_USER,
        request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.QUOTE_NOT_FOUND });
  });

  it('refuses a future-dated instruction rather than paying it today', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);

    const quote = await rig.quotes.quote({
      userId: TEST_USER,
      request: {
        sourceAccountId: from,
        destination: { kind: 'INTERNAL', accountId: to },
        amount: gbpWire('1000'),
        amountIsReceiveSide: false,
        chargeBearer: 'SHA',
      },
    });

    await expect(
      rig.execute.execute({
        userId: TEST_USER,
        stepUpToken: STEP_UP,
        request: {
          quoteId: quote.id,
          executeOn: '2026-12-01',
          saveBeneficiary: false,
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FEATURE_DISABLED });
  });

  it('refuses a cross-currency internal transfer instead of inventing a rate', async () => {
    const rig = transfersRig(productFixture({ currencies: ['GBP', 'USD'] }));
    const { from, to } = await twoParties(rig);

    await expect(
      rig.quotes.quote({
        userId: TEST_USER,
        request: {
          sourceAccountId: from,
          destination: { kind: 'INTERNAL', accountId: to },
          amount: { amount: '5000', currency: 'USD' },
          amountIsReceiveSide: false,
          chargeBearer: 'SHA',
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CURRENCY_MISMATCH });
  });
});

describe('limits', () => {
  it('consumes the allowance only when the payment actually happens', async () => {
    const rig = transfersRig();
    const { from, to } = await twoParties(rig);
    rig.limits.capAt(Money.fromMinor('20000', 'GBP'));

    await send(rig, { from, to, minor: '15000' });
    expect(rig.limits.recorded).toEqual([{ accountId: from, amount: '15000' }]);

    await expect(send(rig, { from, to, minor: '15000' })).rejects.toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
    });
    expect(rig.limits.recorded).toHaveLength(1);
  });
});

const ONE_HOUR_MS = 3_600_000;

function sumOf(
  postings: readonly { direction: string; amount: { amount: string } }[],
  direction: string,
): string {
  return postings
    .filter((posting) => posting.direction === direction)
    .reduce((total, posting) => total + BigInt(posting.amount.amount), 0n)
    .toString();
}
