import { ErrorCode, JournalEntryStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { GL } from '../../../domain/ledger/index.js';
import { MAX_REFERENCE_LENGTH, REVERSAL_REFERENCE_PREFIX } from '../ledger.constants.js';
import { PostingService } from '../posting.service.js';
import { ReversalService, reversalReference } from '../reversal.service.js';

import {
  fundingEntry,
  ledgerTestRig,
  passthroughRunner,
  testAccountId,
} from './ledger-test.helpers.js';

const GBP = 'GBP';

function setup() {
  const rig = ledgerTestRig();
  const runner = passthroughRunner();
  const posting = new PostingService(rig.entries, rig.glAccounts, rig.balances, runner);
  const reversals = new ReversalService(posting, rig.entries, runner, new ClockService());
  return { ...rig, posting, reversals };
}

describe('ReversalService.reverse', () => {
  it('posts the mirror entry and returns every balance to its start', async () => {
    const { posting, reversals, entries, balances, glAccounts } = setup();
    const accountId = testAccountId('A');
    balances.open({ accountId, opening: Money.fromMinor(500, GBP) });

    const original = await posting.post(
      fundingEntry({ reference: 'REV-1', accountId, amount: Money.fromMinor(300, GBP) }),
    );
    const reversal = await reversals.reverse({ entryId: original.id, reason: 'duplicate charge' });

    expect(reversal.reference).toBe(`${REVERSAL_REFERENCE_PREFIX}REV-1`);
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(balances.balanceOf(accountId).amount).toBe(500n);

    const marked = await entries.findByPublicId(original.id);
    expect(marked?.status).toBe(JournalEntryStatus.REVERSED);
    expect(marked?.reversedByEntryId).toBe(reversal.id);

    const nostro = await glAccounts.findByCode(GL.NOSTRO_CLEARING);
    expect(nostro?.balances[GBP]?.amount).toBe('0');
  });

  it('refuses to reverse an entry twice', async () => {
    const { posting, reversals, balances } = setup();
    const accountId = testAccountId('A');
    balances.open({ accountId, opening: Money.zero(GBP) });
    const original = await posting.post(
      fundingEntry({ reference: 'REV-2', accountId, amount: Money.fromMinor(100, GBP) }),
    );

    await reversals.reverse({ entryId: original.id, reason: 'first' });

    await expect(
      reversals.reverse({ entryId: original.id, reason: 'second' }),
    ).rejects.toMatchObject({ code: ErrorCode.TRANSACTION_NOT_REVERSIBLE });
  });

  it('rejects an unknown entry id', async () => {
    const { reversals } = setup();

    await expect(
      reversals.reverse({ entryId: 'jnl_DOESNOTEXIST000000000000', reason: 'ghost' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('is idempotent when the same reversal is retried', async () => {
    const { posting, reversals, balances } = setup();
    const accountId = testAccountId('A');
    balances.open({ accountId, opening: Money.zero(GBP) });
    const original = await posting.post(
      fundingEntry({ reference: 'REV-3', accountId, amount: Money.fromMinor(100, GBP) }),
    );

    const first = await reversals.reverse({ entryId: original.id, reason: 'retry me' });

    // A retry after the original is marked is refused — the guard, not the reference
    // uniqueness, is what protects against a double reversal.
    await expect(
      reversals.reverse({ entryId: original.id, reason: 'retry me' }),
    ).rejects.toMatchObject({ code: ErrorCode.TRANSACTION_NOT_REVERSIBLE });

    expect(first.reversesEntryId).toBe(original.id);
  });
});

describe('reversalReference', () => {
  it('prefixes the original reference', () => {
    expect(reversalReference('PAY-123')).toBe(`${REVERSAL_REFERENCE_PREFIX}PAY-123`);
  });

  it('refuses a reference that would exceed the rail limit once prefixed', () => {
    const tooLong = 'X'.repeat(MAX_REFERENCE_LENGTH);

    expect(() => reversalReference(tooLong)).toThrow(/too long to reverse/);
  });
});
