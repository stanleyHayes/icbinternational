import { ErrorCode, NameCheckResult } from '@reliance/contracts';

import { gbp, seedAccount, TEST_USER } from '../../accounts/__tests__/accounts-harness.js';
import { COOLING_OFF_HOURS } from '../../beneficiaries/index.js';

import { gbpWire, transfersRig, type TransfersRig } from './transfers-harness.js';

const PAYEE_USER = 'usr_01JQ8Z0000000000000PAYEE2';
const STEP_UP = 'step-up-proof';
const ONE_HOUR_MS = 3_600_000;

/** Above the £1,000 cooling-off ceiling. */
const OVER_CEILING = '150000';
/** Comfortably under it. */
const UNDER_CEILING = '25000';

async function scene(rig: TransfersRig) {
  const from = await seedAccount(rig.accounts, { ledger: gbp('500000') });
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

function quoteFor(rig: TransfersRig, from: string, to: string, minor: string) {
  return rig.quotes.quote({
    userId: TEST_USER,
    request: {
      sourceAccountId: from,
      destination: { kind: 'INTERNAL', accountId: to },
      amount: gbpWire(minor),
      amountIsReceiveSide: false,
      chargeBearer: 'SHA',
    },
  });
}

async function savePayee(rig: TransfersRig, accountId: string, extraKeys?: string[]) {
  return rig.beneficiaries.create({
    userId: TEST_USER,
    request: {
      nickname: 'Ada Lovelace',
      destination: { kind: 'INTERNAL', accountId },
      currency: 'GBP',
      isFavourite: false,
    },
    ...(extraKeys ? { extraKeys } : {}),
  });
}

describe('the cooling-off window', () => {
  it('refuses a large payment to a payee that has never been saved', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    await expect(quoteFor(rig, from, to, OVER_CEILING)).rejects.toMatchObject({
      code: ErrorCode.BENEFICIARY_COOLING_OFF,
    });
  });

  it('allows a small payment to the same brand-new payee', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    const quote = await quoteFor(rig, from, to, UNDER_CEILING);
    expect(quote.debitAmount.amount).toBe(UNDER_CEILING);
  });

  it('still refuses a large payment while a freshly saved payee is inside the window', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);
    await savePayee(rig, to);

    await expect(quoteFor(rig, from, to, OVER_CEILING)).rejects.toMatchObject({
      code: ErrorCode.BENEFICIARY_COOLING_OFF,
    });
  });

  it('allows the large payment once the window has passed', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);
    await savePayee(rig, to);

    rig.clock.advance((COOLING_OFF_HOURS + 1) * ONE_HOUR_MS);

    const quote = await quoteFor(rig, from, to, OVER_CEILING);
    const transfer = await rig.execute.execute({
      userId: TEST_USER,
      stepUpToken: STEP_UP,
      request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
    });

    expect(transfer.debitAmount.amount).toBe(OVER_CEILING);
    expect((await rig.balances.snapshot(to)).ledger.amount.toString()).toBe(OVER_CEILING);
  });

  it('does not apply to moving money between the customer’s own accounts', async () => {
    const rig = transfersRig();
    const from = await seedAccount(rig.accounts, { ledger: gbp('500000') });
    const own = await seedAccount(rig.accounts, { ledger: gbp('0') });

    const quote = await quoteFor(rig, from, own, OVER_CEILING);
    const transfer = await rig.execute.execute({
      userId: TEST_USER,
      stepUpToken: STEP_UP,
      request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
    });

    expect(transfer.debitAmount.amount).toBe(OVER_CEILING);
    expect((await rig.balances.snapshot(own)).ledger.amount.toString()).toBe(OVER_CEILING);
  });

  it('recognises a payee saved by email when the payment names their account', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    // Saved by email; the transfer path resolves that to an account, so the saved record
    // carries the account key too and the two are recognised as one payee.
    await rig.beneficiaries.create({
      userId: TEST_USER,
      request: {
        nickname: 'Ada Lovelace',
        destination: { kind: 'INTERNAL', email: 'ada@example.com' },
        currency: 'GBP',
        isFavourite: false,
      },
      extraKeys: [`internal:acc:${to}`.toLowerCase()],
    });

    rig.clock.advance((COOLING_OFF_HOURS + 1) * ONE_HOUR_MS);

    const quote = await quoteFor(rig, from, to, OVER_CEILING);
    expect(quote.debitAmount.amount).toBe(OVER_CEILING);
  });
});

describe('step-up', () => {
  it('is demanded for a payee the customer has never paid', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    const quote = await quoteFor(rig, from, to, UNDER_CEILING);
    expect(quote.requiresStepUp).toBe(true);

    await expect(
      rig.execute.execute({
        userId: TEST_USER,
        request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.STEP_UP_REQUIRED });
  });

  it('refuses a proof issued to somebody else and moves no money', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);
    const quote = await quoteFor(rig, from, to, UNDER_CEILING);

    await expect(
      rig.execute.execute({
        userId: TEST_USER,
        stepUpToken: 'somebody-elses-proof',
        request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.STEP_UP_REQUIRED });

    expect((await rig.balances.snapshot(to)).ledger.amount.toString()).toBe('0');
  });
});

describe('saving the payee from the payment', () => {
  it('files the payee and starts their cooling-off clock', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    const quote = await quoteFor(rig, from, to, UNDER_CEILING);
    const transfer = await rig.execute.execute({
      userId: TEST_USER,
      stepUpToken: STEP_UP,
      request: {
        quoteId: quote.id,
        saveBeneficiary: true,
        beneficiaryNickname: 'Ada Lovelace',
        metadata: {},
      },
    });

    expect(transfer.beneficiaryId).not.toBeNull();

    const [saved] = await rig.beneficiaries.list(TEST_USER);
    expect(saved?.nickname).toBe('Ada Lovelace');
    expect(saved?.nameCheck).toBe(NameCheckResult.MATCH);
    expect(Date.parse(saved?.trustedFrom ?? '')).toBe(
      rig.clock.timestamp() + COOLING_OFF_HOURS * ONE_HOUR_MS,
    );
  });

  it('reuses the existing payee on a second payment rather than filing a duplicate', async () => {
    const rig = transfersRig();
    const { from, to } = await scene(rig);

    for (const nickname of ['Ada Lovelace', 'Ada again']) {
      const quote = await quoteFor(rig, from, to, UNDER_CEILING);
      await rig.execute.execute({
        userId: TEST_USER,
        stepUpToken: STEP_UP,
        request: {
          quoteId: quote.id,
          saveBeneficiary: true,
          beneficiaryNickname: nickname,
          metadata: {},
        },
      });
    }

    expect(await rig.beneficiaries.list(TEST_USER)).toHaveLength(1);
  });
});
