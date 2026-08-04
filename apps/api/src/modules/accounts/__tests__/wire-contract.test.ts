import { accountSchema, balanceSchema, netWorthSchema, AccountStatus } from '@reliance/contracts';

import { type UsersService } from '../../auth/users/index.js';
import { toContractAccount, toContractBalance } from '../account.mapper.js';
import { toRecord } from '../account.repository.js';
import { type AccountDocument } from '../account.schema.js';
import { type AccountRecord } from '../account.store.js';
import { IdentityExchangeRatePort } from '../exchange-rate.port.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';
import { NetWorthService } from '../net-worth.service.js';

import { frozenClock, gbp, seedAccount, TEST_NOW, TEST_USER } from './accounts-harness.js';

/**
 * Everything this lane puts on the wire, validated against the frozen contract.
 *
 * The mappers are the only place a field name or a nullability can drift away from
 * `packages/contracts`, and a drift there is invisible until a front end crashes on it.
 * Parsing the output with the contract's own schema is the cheapest possible guard.
 */
describe('wire shapes', () => {
  it('renders an account exactly as accountSchema describes it', async () => {
    const accounts = new InMemoryAccountStore();
    const accountId = await seedAccount(accounts, {
      ledger: gbp('120000'),
      held: gbp('45000'),
      overdraft: gbp('50000'),
      nickname: 'Bills',
      interestRateBps: 125,
    });

    const record = await accounts.findById(accountId);
    const wire = toContractAccount(record as AccountRecord, TEST_NOW);

    expect(() => accountSchema.parse(wire)).not.toThrow();
  });

  it('renders a closed account with a closedAt timestamp', async () => {
    const accounts = new InMemoryAccountStore();
    const accountId = await seedAccount(accounts);
    await accounts.patch({
      accountId,
      fields: { status: AccountStatus.CLOSED, closedAt: TEST_NOW },
    });

    const record = await accounts.findById(accountId);
    const wire = accountSchema.parse(toContractAccount(record as AccountRecord, TEST_NOW));

    expect(wire.closedAt).toBe(TEST_NOW.toISOString());
  });

  it('renders a balance block that balanceSchema accepts', async () => {
    const accounts = new InMemoryAccountStore();
    const accountId = await seedAccount(accounts, { ledger: gbp('-2000'), overdraft: gbp('5000') });

    const record = await accounts.findById(accountId);
    expect(() =>
      balanceSchema.parse(toContractBalance(record as AccountRecord, TEST_NOW)),
    ).not.toThrow();
  });

  it('renders net worth exactly as netWorthSchema describes it', async () => {
    const accounts = new InMemoryAccountStore();
    await seedAccount(accounts, { ledger: gbp('120000') });
    const users = {
      requireById: async (id: string) => ({ id, baseCurrency: 'GBP' }),
    } as unknown as UsersService;

    const worth = await new NetWorthService(
      accounts,
      new IdentityExchangeRatePort(),
      users,
      frozenClock(),
    ).forUser(TEST_USER);

    expect(() => netWorthSchema.parse(worth)).not.toThrow();
  });
});

/**
 * The repository hands services a plain value, never a live document.
 *
 * A service holding something with `.save()` on it is a service that can write the books
 * outside a transaction, and a service holding the document's own nested objects can
 * mutate persisted state by accident.
 */
describe('document to record', () => {
  it('detaches the arrays and money objects from the document', () => {
    const plain = {
      id: 'acc_01JQ8Z00000000000000000000',
      holderIds: ['usr_a'],
      ledgerBalance: { amount: '100', currency: 'GBP' },
      availableBalance: { amount: '100', currency: 'GBP' },
      holdTotal: { amount: '0', currency: 'GBP' },
      overdraftLimit: { amount: '0', currency: 'GBP' },
      minimumOpeningBalance: { amount: '0', currency: 'GBP' },
    };
    const document = { toObject: () => plain } as unknown as AccountDocument;

    const record = toRecord(document);
    // The record must be a defensive copy: mutating it must not reach the document.
    (record.holderIds as string[]).push('usr_b');

    expect(plain.holderIds).toEqual(['usr_a']);
    expect(record.ledgerBalance).not.toBe(plain.ledgerBalance);
    expect(record.ledgerBalance).toEqual(plain.ledgerBalance);
  });
});
