import { ErrorCode, TransferRail, TransferStatus } from '@reliance/contracts';

import { OTHER_USER, TEST_USER } from '../../accounts/__tests__/accounts-harness.js';
import { isCancellable, railFor, limitScopeFor, feeKindFor } from '../transfer-rules.js';
import {
  appendEvent,
  currentStatus,
  settledTimeline,
  TIMELINE_DETAIL,
} from '../transfer-timeline.js';
import { type NewTransfer } from '../transfer.store.js';

import { transfersRig, type TransfersRig } from './transfers-harness.js';

const SOURCE = 'acc_01JQ8Z00000000000SOURCE01';
const PAYEE = 'acc_01JQ8Z000000000000PAYEE01';

function draft(overrides: Partial<NewTransfer> = {}): NewTransfer {
  const at = new Date('2026-03-01T09:00:00.000Z');

  return {
    userId: TEST_USER,
    quoteId: `qte_01JQ8Z0000000000000000${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    rail: TransferRail.INTERNAL,
    status: TransferStatus.SETTLED,
    sourceAccountId: SOURCE,
    destination: { kind: 'INTERNAL', accountId: PAYEE },
    destinationAccountId: PAYEE,
    debitAmount: { amount: '1000', currency: 'GBP' },
    creditAmount: { amount: '1000', currency: 'GBP' },
    fee: { amount: '0', currency: 'GBP' },
    exchangeRate: null,
    reference: null,
    journalEntryId: 'jnl_01JQ8Z0000000000000000ENT1',
    feeJournalEntryId: null,
    beneficiaryId: null,
    timeline: settledTimeline(at),
    estimatedArrival: at,
    settledAt: at,
    metadata: {},
    createdAt: at,
    ...overrides,
  };
}

async function seedTransfers(rig: TransfersRig, count: number) {
  const created = [];
  for (let index = 0; index < count; index += 1) {
    created.push(
      await rig.transferStore.insert(
        draft({ createdAt: new Date(Date.UTC(2026, 2, 1, 9, index)) }),
      ),
    );
  }
  return created;
}

describe('reading a customer’s transfers', () => {
  it('pages newest first and hands back a usable cursor', async () => {
    const rig = transfersRig();
    await seedTransfers(rig, 5);

    const first = await rig.transfers.list(TEST_USER, { limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.page.hasMore).toBe(true);

    const second = await rig.transfers.list(TEST_USER, {
      limit: 2,
      cursor: first.page.cursor ?? '',
    });

    expect(second.data).toHaveLength(2);
    expect(second.data.map((row) => row.id)).not.toEqual(first.data.map((row) => row.id));
  });

  it('filters by status and by source account', async () => {
    const rig = transfersRig();
    await rig.transferStore.insert(draft());
    await rig.transferStore.insert(draft({ status: TransferStatus.PENDING }));

    const pending = await rig.transfers.list(TEST_USER, {
      limit: 10,
      status: TransferStatus.PENDING,
    });
    expect(pending.data).toHaveLength(1);

    const elsewhere = await rig.transfers.list(TEST_USER, {
      limit: 10,
      sourceAccountId: 'acc_01JQ8Z0000000000000OTHER1',
    });
    expect(elsewhere.data).toHaveLength(0);
  });

  it('hides another customer’s transfer behind a 404', async () => {
    const rig = transfersRig();
    const [only] = await seedTransfers(rig, 1);

    await expect(rig.transfers.get(OTHER_USER, only?.id ?? '')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect((await rig.transfers.list(OTHER_USER, { limit: 10 })).data).toHaveLength(0);
  });
});

describe('cancelling', () => {
  it('calls off a transfer that has not gone yet', async () => {
    const rig = transfersRig();
    const pending = await rig.transferStore.insert(
      draft({ status: TransferStatus.PENDING, settledAt: null }),
    );

    const cancelled = await rig.transfers.cancel(TEST_USER, pending.id);

    expect(cancelled.status).toBe(TransferStatus.CANCELLED);
    expect(cancelled.timeline.at(-1)?.detail).toBe(TIMELINE_DETAIL.cancelled);
  });

  it('refuses to cancel a settled transfer, because the payee already has the money', async () => {
    const rig = transfersRig();
    const [settled] = await seedTransfers(rig, 1);

    await expect(rig.transfers.cancel(TEST_USER, settled?.id ?? '')).rejects.toMatchObject({
      code: ErrorCode.TRANSFER_NOT_CANCELLABLE,
    });
  });

  it('lets exactly one of two simultaneous cancellations win', async () => {
    const rig = transfersRig();
    const pending = await rig.transferStore.insert(
      draft({ status: TransferStatus.PENDING, settledAt: null }),
    );

    const outcomes = await Promise.allSettled([
      rig.transfers.cancel(TEST_USER, pending.id),
      rig.transfers.cancel(TEST_USER, pending.id),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('the pure transfer rules', () => {
  it('routes each destination to its own rail', () => {
    expect(railFor({ kind: 'INTERNAL', accountId: PAYEE })).toBe(TransferRail.INTERNAL);
    expect(
      railFor({
        kind: 'DOMESTIC',
        accountName: 'Ada',
        accountNumber: '1234567890',
        sortCode: '049921',
      }),
    ).toBe(TransferRail.DOMESTIC_ACH);
    expect(
      railFor({
        kind: 'INTERNATIONAL',
        accountName: 'Ada',
        iban: 'GB29NWBK60161331926819',
        bic: 'NWBKGB2L',
        bankName: 'NatWest',
        country: 'GB',
      }),
    ).toBe(TransferRail.INTERNATIONAL_SWIFT);
  });

  it('measures each rail against its own allowance', () => {
    expect(limitScopeFor(TransferRail.INTERNAL)).toBe('internalTransfer');
    expect(limitScopeFor(TransferRail.DOMESTIC_ACH)).toBe('domesticTransfer');
    expect(limitScopeFor(TransferRail.INTERNATIONAL_SWIFT)).toBe('internationalTransfer');
  });

  it('leaves an internal transfer unpriced, and prices the others', () => {
    expect(feeKindFor(TransferRail.INTERNAL)).toBeNull();
    expect(feeKindFor(TransferRail.DOMESTIC_RTGS)).toBe('DOMESTIC_TRANSFER');
    expect(feeKindFor(TransferRail.INTERNATIONAL_SWIFT)).toBe('INTERNATIONAL_TRANSFER');
  });

  it('allows a cancel only while the money has not gone', () => {
    expect(isCancellable(TransferStatus.PENDING)).toBe(true);
    expect(isCancellable(TransferStatus.SCHEDULED)).toBe(true);
    expect(isCancellable(TransferStatus.SETTLED)).toBe(false);
    expect(isCancellable(TransferStatus.CANCELLED)).toBe(false);
  });
});

describe('the timeline', () => {
  const at = new Date('2026-03-01T09:00:00.000Z');

  it('records authorisation and delivery as two events at the same instant', () => {
    const timeline = settledTimeline(at);
    expect(timeline.map((event) => event.status)).toEqual([
      TransferStatus.SUBMITTED,
      TransferStatus.SETTLED,
    ]);
    expect(currentStatus(timeline)).toBe(TransferStatus.SETTLED);
  });

  it('appends without mutating', () => {
    const timeline = settledTimeline(at);
    const extended = appendEvent(timeline, {
      status: TransferStatus.RETURNED,
      at,
      detail: 'Returned by the payee bank',
    });

    expect(timeline).toHaveLength(2);
    expect(extended).toHaveLength(3);
    expect(currentStatus(extended)).toBe(TransferStatus.RETURNED);
  });

  it('reads an empty timeline as a draft rather than throwing', () => {
    expect(currentStatus([])).toBe(TransferStatus.DRAFT);
  });
});
