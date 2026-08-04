import { IdGenerator } from '../../../common/ids/id-generator.js';
import { fromStoredOrZero, toStored, type StoredMoney } from '../../../common/money/money.codec.js';
import { CHART_OF_ACCOUNTS } from '../../../domain/ledger/index.js';

import {
  LedgerAccountStore,
  type EnsureOutcome,
  type LedgerAccountRecord,
  type LedgerEffectInput,
  type NewLedgerAccount,
  type TrialBalanceQuery,
  type TrialBalanceRow,
} from './ledger-account.store.js';

/**
 * An in-memory {@link LedgerAccountStore}, honest in the same way as its journal-entry
 * sibling: seeding is idempotent, effects apply per currency, and an unknown GL code is
 * an error rather than a silent creation.
 *
 * {@link seedChart} preloads the real chart of accounts from the domain, which is what a
 * service test almost always wants — a posting cannot be built against a code the domain
 * does not know, so the store should know exactly those codes and no others.
 */
export class InMemoryLedgerAccountStore extends LedgerAccountStore {
  private readonly accounts = new Map<string, MutableLedgerAccount>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  /** Loads the domain chart of accounts. Returns the store for chaining. */
  seedChart(): this {
    for (const entry of CHART_OF_ACCOUNTS) {
      this.accounts.set(entry.code, {
        id: this.ids.generate('ledgerAccount'),
        code: entry.code,
        name: entry.name,
        type: entry.type,
        isControlAccount: entry.isControlAccount,
        balances: {},
      });
    }
    return this;
  }

  override async findByCode(code: string): Promise<LedgerAccountRecord | null> {
    const account = this.accounts.get(code);
    return account ? toRecord(account) : null;
  }

  override async listAll(): Promise<LedgerAccountRecord[]> {
    return [...this.accounts.values()].sort((a, b) => a.code.localeCompare(b.code)).map(toRecord);
  }

  /** Same three-way outcome as the Mongo store: created, updated or unchanged. */
  override async ensure(input: NewLedgerAccount): Promise<EnsureOutcome> {
    const existing = this.accounts.get(input.code);

    if (!existing) {
      const created: MutableLedgerAccount = {
        ...input,
        id: this.ids.generate('ledgerAccount'),
        balances: {},
      };
      this.accounts.set(input.code, created);
      return { record: toRecord(created), result: 'created' };
    }

    if (existing.name === input.name && existing.isControlAccount === input.isControlAccount) {
      return { record: toRecord(existing), result: 'unchanged' };
    }

    existing.name = input.name;
    existing.isControlAccount = input.isControlAccount;
    return { record: toRecord(existing), result: 'updated' };
  }

  /** Read-modify-write per currency; `Money.plus` rejects a currency mix for us. */
  override async applyEffect(input: LedgerEffectInput): Promise<void> {
    const account = this.accounts.get(input.code);
    if (!account) {
      throw new RangeError(
        `GL account ${input.code} does not exist. Seed the chart of accounts before posting.`,
      );
    }

    const currency = input.delta.currency;
    const next = fromStoredOrZero(account.balances[currency], currency).plus(input.delta);
    account.balances[currency] = toStored(next);
  }

  override async trialBalance(query: TrialBalanceQuery): Promise<TrialBalanceRow[]> {
    return [...this.accounts.values()]
      .filter((account) => account.balances[query.currency] !== undefined)
      .map((account) => ({
        code: account.code,
        name: account.name,
        type: account.type,
        balance: account.balances[query.currency] as StoredMoney,
      }));
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.accounts.clear();
  }
}

type MutableLedgerAccount = Omit<LedgerAccountRecord, 'balances'> & {
  name: string;
  isControlAccount: boolean;
  balances: Record<string, StoredMoney>;
};

function toRecord(account: MutableLedgerAccount): LedgerAccountRecord {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    isControlAccount: account.isControlAccount,
    balances: { ...account.balances },
  };
}
