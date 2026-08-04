import { JournalEntryStatus, LedgerAccountType, PostingDirection } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { GL } from '../../../domain/ledger/index.js';
import { toDebitCreditColumns } from '../balance-columns.js';
import { toNewJournalEntry } from '../ledger.mapper.js';
import {
  type JournalEntryRecord,
  type PostingRecord,
} from '../repositories/journal-entry.store.js';
import {
  controlTotalsFromReplay,
  diffBalance,
  trialBalanceFromReplay,
} from '../verification/drift.js';
import { LedgerReplay } from '../verification/ledger-replay.js';
import { DriftScope, type ReplayedBalance } from '../verification/verification.types.js';

import {
  TEST_BOOKED_AT,
  TEST_VALUE_DATE,
  fundingEntry,
  testAccountId,
  transferEntry,
} from './ledger-test.helpers.js';

const GBP = 'GBP';

function recordOf(entry: ReturnType<typeof fundingEntry>, id: string): JournalEntryRecord {
  return { ...toNewJournalEntry(entry), id, reversedByEntryId: null };
}

function postingRecord(overrides: Partial<PostingRecord>): PostingRecord {
  return {
    ledgerAccountCode: GL.NOSTRO_CLEARING,
    ledgerAccountName: 'Nostro / External Clearing',
    accountId: null,
    direction: PostingDirection.DEBIT,
    amount: toStored(Money.fromMinor(100, GBP)),
    narrative: 'probe',
    ...overrides,
  };
}

describe('LedgerReplay', () => {
  it('rebuilds GL and customer balances from postings', () => {
    const replay = new LedgerReplay();
    replay.add(
      recordOf(
        fundingEntry({
          reference: 'R-1',
          accountId: testAccountId('A'),
          amount: Money.fromMinor(1000, GBP),
        }),
        'jnl_A',
      ),
    );
    replay.add(
      recordOf(
        transferEntry({
          reference: 'R-2',
          fromAccountId: testAccountId('A'),
          toAccountId: testAccountId('B'),
          amount: Money.fromMinor(400, GBP),
        }),
        'jnl_B',
      ),
    );

    const gl = new Map(
      replay.ledgerBalances().map((b) => [`${b.target}|${b.currency}`, b.balance.amount]),
    );
    const customers = new Map(
      replay.customerBalances().map((b) => [`${b.target}|${b.currency}`, b.balance.amount]),
    );

    expect(gl.get(`${GL.NOSTRO_CLEARING}|GBP`)).toBe(1000n);
    expect(gl.get(`${GL.CUSTOMER_DEPOSITS}|GBP`)).toBe(1000n);
    expect(customers.get(`${testAccountId('A')}|GBP`)).toBe(600n);
    expect(customers.get(`${testAccountId('B')}|GBP`)).toBe(400n);
    expect(replay.entriesScanned).toBe(2);
  });

  it('skips PENDING entries but folds REVERSED ones back in', () => {
    const replay = new LedgerReplay();
    const pending = recordOf(
      fundingEntry({
        reference: 'P-1',
        accountId: testAccountId('A'),
        amount: Money.fromMinor(100, GBP),
      }),
      'jnl_P',
    );
    replay.add({ ...pending, status: JournalEntryStatus.PENDING });

    expect(replay.entriesScanned).toBe(0);
    expect(replay.ledgerBalances()).toHaveLength(0);
  });

  it('flags an entry whose stored postings do not balance', () => {
    const replay = new LedgerReplay();
    replay.add({
      id: 'jnl_BAD',
      reference: 'BAD-1',
      type: 'INTERNAL_TRANSFER',
      status: JournalEntryStatus.POSTED,
      description: 'tampered',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
      postings: [
        postingRecord({ direction: PostingDirection.DEBIT }),
        postingRecord({
          ledgerAccountCode: GL.UNSETTLED_INBOUND,
          ledgerAccountName: 'Unsettled Inbound Payments',
          direction: PostingDirection.CREDIT,
          amount: toStored(Money.fromMinor(99, GBP)),
        }),
      ],
      reversesEntryId: null,
      reversedByEntryId: null,
      metadata: {},
    });

    expect(replay.unbalancedEntries).toHaveLength(1);
    expect(replay.unbalancedEntries[0]?.reference).toBe('BAD-1');
  });
});

describe('diffBalance', () => {
  const replayed: ReplayedBalance = {
    target: GL.NOSTRO_CLEARING,
    currency: GBP,
    balance: Money.fromMinor(1000, GBP),
  };

  it('returns null when stored matches the replay', () => {
    expect(
      diffBalance({
        scope: DriftScope.LEDGER_ACCOUNT,
        replayed,
        stored: Money.fromMinor(1000, GBP),
      }),
    ).toBeNull();
  });

  it('reports the difference when stored disagrees', () => {
    const drift = diffBalance({
      scope: DriftScope.LEDGER_ACCOUNT,
      replayed,
      stored: Money.fromMinor(1200, GBP),
    });

    expect(drift?.expected).toBe('1000');
    expect(drift?.actual).toBe('1200');
    expect(drift?.difference).toBe('200');
  });

  it('reports a missing stored record rather than treating it as zero', () => {
    const drift = diffBalance({ scope: DriftScope.CUSTOMER_ACCOUNT, replayed, stored: null });

    expect(drift?.actual).toBeNull();
    expect(drift?.difference).toBe('-1000');
  });
});

describe('trialBalanceFromReplay', () => {
  it('balances when debits equal credits across the book', () => {
    const replay = new LedgerReplay();
    replay.add(
      recordOf(
        fundingEntry({
          reference: 'TB-1',
          accountId: testAccountId('A'),
          amount: Money.fromMinor(700, GBP),
        }),
        'jnl_TB',
      ),
    );

    const [line] = trialBalanceFromReplay(replay.ledgerBalances());
    expect(line?.balanced).toBe(true);
    expect(line?.totalDebits).toBe('700');
    expect(line?.totalCredits).toBe('700');
  });
});

describe('controlTotalsFromReplay', () => {
  it('matches when every GL 2000 leg names a customer', () => {
    const replay = new LedgerReplay();
    replay.add(
      recordOf(
        fundingEntry({
          reference: 'CT-1',
          accountId: testAccountId('A'),
          amount: Money.fromMinor(700, GBP),
        }),
        'jnl_CT',
      ),
    );

    const [check] = controlTotalsFromReplay({
      ledgerBalances: replay.ledgerBalances(),
      customerBalances: replay.customerBalances(),
    });

    expect(check?.matched).toBe(true);
    expect(check?.customerDepositsTotal).toBe('700');
  });

  it('fails when value reaches the control account without a customer', () => {
    const ledgerBalances: ReplayedBalance[] = [
      { target: GL.CUSTOMER_DEPOSITS, currency: GBP, balance: Money.fromMinor(700, GBP) },
    ];

    const [check] = controlTotalsFromReplay({ ledgerBalances, customerBalances: [] });

    expect(check?.matched).toBe(false);
    expect(check?.difference).toBe('-700');
  });
});

describe('toDebitCreditColumns', () => {
  it('puts a positive asset balance in the debit column', () => {
    const columns = toDebitCreditColumns({
      type: LedgerAccountType.ASSET,
      balance: Money.fromMinor(500, GBP),
    });

    expect(columns.debit.amount).toBe(500n);
    expect(columns.credit.isZero).toBe(true);
  });

  it('puts a negative liability in the debit column with its magnitude', () => {
    const columns = toDebitCreditColumns({
      type: LedgerAccountType.LIABILITY,
      balance: Money.fromMinor(-200, GBP),
    });

    expect(columns.debit.amount).toBe(200n);
    expect(columns.credit.isZero).toBe(true);
  });
});
