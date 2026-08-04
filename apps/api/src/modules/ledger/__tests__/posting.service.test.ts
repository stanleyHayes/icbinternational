import { EntryType, ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { EntryBuilder, GL, productEntries } from '../../../domain/ledger/index.js';
import { PostingService } from '../posting.service.js';

import {
  TEST_BOOKED_AT,
  TEST_VALUE_DATE,
  fundingEntry,
  ledgerTestRig,
  passthroughRunner,
  testAccountId,
  transferEntry,
} from './ledger-test.helpers.js';

const GBP = 'GBP';
const USD = 'USD';

function setup() {
  const rig = ledgerTestRig();
  const service = new PostingService(
    rig.entries,
    rig.glAccounts,
    rig.balances,
    passthroughRunner(),
  );
  return { ...rig, service };
}

describe('PostingService.post', () => {
  it('books the entry and moves both projections', async () => {
    const { service, glAccounts, balances } = setup();
    const accountId = testAccountId('A');
    balances.open({ accountId, opening: Money.zero(GBP) });

    const record = await service.post(
      fundingEntry({ reference: 'POST-1', accountId, amount: Money.fromMinor(1000, GBP) }),
    );

    expect(record.id).toMatch(/^jnl_/);
    expect(balances.balanceOf(accountId).amount).toBe(1000n);

    const deposits = await glAccounts.findByCode(GL.CUSTOMER_DEPOSITS);
    const nostro = await glAccounts.findByCode(GL.NOSTRO_CLEARING);
    expect(deposits?.balances[GBP]?.amount).toBe('1000');
    expect(nostro?.balances[GBP]?.amount).toBe('1000');
  });

  it('returns the existing entry when the reference was already booked', async () => {
    const { service, entries, balances } = setup();
    const accountId = testAccountId('A');
    balances.open({ accountId, opening: Money.zero(GBP) });
    const entry = fundingEntry({
      reference: 'DUP-1',
      accountId,
      amount: Money.fromMinor(100, GBP),
    });

    const first = await service.post(entry);
    const second = await service.post(entry);

    expect(second.id).toBe(first.id);
    expect(await entries.scanFrom({ limit: 10 })).toHaveLength(1);
    expect(balances.balanceOf(accountId).amount).toBe(100n);
  });

  it('returns the winner after losing an insert race on the unique reference', async () => {
    const { service, entries, balances, glAccounts } = setup();
    const accountId = testAccountId('A');
    balances.open({ accountId, opening: Money.zero(GBP) });
    const entry = fundingEntry({
      reference: 'RACE-1',
      accountId,
      amount: Money.fromMinor(100, GBP),
    });

    const winner = await service.post(entry);

    // Simulate the race: the read-before-write sees nothing, the unique guard fires.
    const originalLookup = entries.findByReference.bind(entries);
    let lookups = 0;
    entries.findByReference = async (reference: string) => {
      lookups += 1;
      return lookups === 1 ? null : originalLookup(reference);
    };

    const raced = new PostingService(entries, glAccounts, balances, passthroughRunner());
    const result = await raced.post(entry);

    expect(result.id).toBe(winner.id);
  });

  it('refuses an orphan leg on GL 2000 before anything is written', async () => {
    const { service, entries } = setup();
    const entry = EntryBuilder.for({
      reference: 'ORPHAN-1',
      type: EntryType.INTERNAL_TRANSFER,
      description: 'orphan',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
    })
      .debitLedger(GL.CUSTOMER_DEPOSITS, Money.fromMinor(100, GBP), 'no account')
      .creditLedger(GL.NOSTRO_CLEARING, Money.fromMinor(100, GBP), 'counterparty')
      .build();

    await expect(service.post(entry)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(await entries.scanFrom({ limit: 10 })).toHaveLength(0);
  });

  it('aborts before writing when an account cannot be posted to', async () => {
    const { service, entries, balances, glAccounts } = setup();
    const accountId = testAccountId('FROZEN');
    balances.open({ accountId, opening: Money.zero(GBP), status: 'FROZEN' });

    await expect(
      service.post(
        fundingEntry({ reference: 'FRZ-1', accountId, amount: Money.fromMinor(100, GBP) }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_FROZEN });

    expect(await entries.scanFrom({ limit: 10 })).toHaveLength(0);
    const deposits = await glAccounts.findByCode(GL.CUSTOMER_DEPOSITS);
    expect(deposits?.balances[GBP]).toBeUndefined();
  });

  it('propagates a closed-account rejection from the balance port', async () => {
    const { service, balances } = setup();
    const accountId = testAccountId('CLOSED');
    balances.open({ accountId, opening: Money.zero(GBP), status: 'CLOSED' });

    const failure = await service
      .post(fundingEntry({ reference: 'CLS-1', accountId, amount: Money.fromMinor(100, GBP) }))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe(ErrorCode.ACCOUNT_CLOSED);
  });

  it('applies a cross-currency entry per currency on both projections', async () => {
    const { service, glAccounts, balances } = setup();
    const from = testAccountId('GBP');
    const to = testAccountId('USD');
    balances.open({ accountId: from, opening: Money.fromMinor(10_000, GBP) });
    balances.open({ accountId: to, opening: Money.zero(USD) });

    await service.post(
      productEntries.fxConversion({
        reference: 'FX-1',
        fromAccountId: from,
        toAccountId: to,
        sellAmount: Money.fromMinor(1000, GBP),
        buyAmount: Money.fromMinor(1200, USD),
        spread: Money.fromMinor(10, USD),
        description: 'convert',
        valueDate: TEST_VALUE_DATE,
        bookedAt: TEST_BOOKED_AT,
      }),
    );

    expect(balances.balanceOf(from).amount).toBe(9000n);
    expect(balances.balanceOf(to).amount).toBe(1200n);

    const nostro = await glAccounts.findByCode(GL.NOSTRO_CLEARING);
    // The bank sold GBP from its nostro (asset credit) and bought USD (asset debit).
    expect(nostro?.balances[GBP]?.amount).toBe('-1000');
    expect(nostro?.balances[USD]?.amount).toBe('1210');
  });

  it('moves both sides of a transfer with one write per account', async () => {
    const { service, balances, glAccounts } = setup();
    const from = testAccountId('A');
    const to = testAccountId('B');
    balances.open({ accountId: from, opening: Money.fromMinor(1000, GBP) });
    balances.open({ accountId: to, opening: Money.zero(GBP) });

    await service.post(
      transferEntry({
        reference: 'TRF-1',
        fromAccountId: from,
        toAccountId: to,
        amount: Money.fromMinor(100, GBP),
      }),
    );

    expect(balances.balanceOf(from).amount).toBe(900n);
    expect(balances.balanceOf(to).amount).toBe(100n);
    // The shared control account nets to zero within one entry, so its stored balance
    // stays untouched rather than being written twice.
    const deposits = await glAccounts.findByCode(GL.CUSTOMER_DEPOSITS);
    expect(deposits?.balances[GBP]).toBeUndefined();
  });
});
