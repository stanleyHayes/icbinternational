import { type ClientSession } from 'mongoose';

import { JournalEntryStatus, PostingDirection } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { toStored } from '../../../common/money/money.codec.js';
import { GL } from '../../../domain/ledger/index.js';
import { LedgerVerifierService } from '../ledger-verifier.service.js';
import { PostingService } from '../posting.service.js';
import { type PostingRecord } from '../repositories/journal-entry.store.js';

import {
  TEST_BOOKED_AT,
  TEST_VALUE_DATE,
  fundingEntry,
  ledgerTestRig,
  passthroughRunner,
  testAccountId,
} from './ledger-test.helpers.js';

const GBP = 'GBP';

function setup() {
  const rig = ledgerTestRig();
  const posting = new PostingService(
    rig.entries,
    rig.glAccounts,
    rig.balances,
    passthroughRunner(),
  );
  const verifier = new LedgerVerifierService(
    rig.entries,
    rig.glAccounts,
    rig.balances,
    new ClockService(),
  );
  return { ...rig, posting, verifier };
}

/** Books a funding entry of `amount` minor units to a freshly opened account. */
async function fund(
  rig: ReturnType<typeof setup>,
  reference: string,
  amount: number,
): Promise<string> {
  const accountId = testAccountId(reference);
  rig.balances.open({ accountId, opening: Money.zero(GBP) });
  await rig.posting.post(
    fundingEntry({ reference, accountId, amount: Money.fromMinor(amount, GBP) }),
  );
  return accountId;
}

describe('LedgerVerifierService', () => {
  it('verifies a clean book as healthy', async () => {
    const rig = setup();
    await fund(rig, 'V-1', 1000);
    await fund(rig, 'V-2', 2500);

    const report = await rig.verifier.verify();

    expect(report.healthy).toBe(true);
    expect(report.entriesScanned).toBe(2);
    expect(report.trialBalance.every((line) => line.balanced)).toBe(true);
    expect(report.controlTotals.every((line) => line.matched)).toBe(true);
  });

  it('detects customer balance drift', async () => {
    const rig = setup();
    const accountId = await fund(rig, 'V-3', 1000);
    rig.balances.injectDrift(accountId, Money.fromMinor(5, GBP));

    const report = await rig.verifier.verify();

    expect(report.healthy).toBe(false);
    expect(report.customerAccountDrift).toHaveLength(1);
    expect(report.customerAccountDrift[0]?.expected).toBe('1000');
    expect(report.customerAccountDrift[0]?.actual).toBe('1005');
  });

  it('detects a stored GL balance no posting produced', async () => {
    const rig = setup();
    await fund(rig, 'V-4', 1000);
    await rig.glAccounts.applyEffect({
      code: GL.FEE_INCOME,
      delta: Money.fromMinor(77, GBP),
      session: {} as ClientSession,
    });

    const report = await rig.verifier.verify();

    expect(report.healthy).toBe(false);
    const finding = report.ledgerAccountDrift.find((d) => d.target === GL.FEE_INCOME);
    expect(finding?.expected).toBe('0');
    expect(finding?.actual).toBe('77');
  });

  it('flags an entry written around the domain that does not balance', async () => {
    const rig = setup();
    const postings: PostingRecord[] = [
      {
        ledgerAccountCode: GL.NOSTRO_CLEARING,
        ledgerAccountName: 'Nostro / External Clearing',
        accountId: null,
        direction: PostingDirection.DEBIT,
        amount: toStored(Money.fromMinor(100, GBP)),
        narrative: 'tampered debit',
      },
      {
        ledgerAccountCode: GL.UNSETTLED_INBOUND,
        ledgerAccountName: 'Unsettled Inbound Payments',
        accountId: null,
        direction: PostingDirection.CREDIT,
        amount: toStored(Money.fromMinor(99, GBP)),
        narrative: 'tampered credit',
      },
    ];

    await rig.entries.insert({
      reference: 'TAMPERED-1',
      type: 'MANUAL_ADJUSTMENT',
      status: JournalEntryStatus.POSTED,
      description: 'written by a bad script',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
      postings,
      reversesEntryId: null,
      metadata: {},
    });

    const report = await rig.verifier.verify();

    expect(report.healthy).toBe(false);
    expect(report.unbalancedEntries.map((finding) => finding.reference)).toContain('TAMPERED-1');
  });

  it('catches value reaching GL 2000 without naming a customer', async () => {
    const rig = setup();
    await rig.entries.insert({
      reference: 'ORPHAN-STORED',
      type: 'INTERNAL_TRANSFER',
      status: JournalEntryStatus.POSTED,
      description: 'orphan control leg',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
      postings: [
        {
          ledgerAccountCode: GL.NOSTRO_CLEARING,
          ledgerAccountName: 'Nostro / External Clearing',
          accountId: null,
          direction: PostingDirection.DEBIT,
          amount: toStored(Money.fromMinor(100, GBP)),
          narrative: 'in',
        },
        {
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          ledgerAccountName: 'Customer Deposits',
          accountId: null,
          direction: PostingDirection.CREDIT,
          amount: toStored(Money.fromMinor(100, GBP)),
          narrative: 'out, to nobody',
        },
      ],
      reversesEntryId: null,
      metadata: {},
    });

    const report = await rig.verifier.verify();

    expect(report.healthy).toBe(false);
    expect(report.controlTotals.some((line) => !line.matched)).toBe(true);
  });
});
