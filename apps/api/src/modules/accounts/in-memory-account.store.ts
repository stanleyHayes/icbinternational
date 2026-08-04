import { Injectable } from '@nestjs/common';

import { AccountStatus } from '@reliance/contracts';

import { toStored } from '../../common/money/money.codec.js';

import {
  AccountStore,
  type AccountPatchInput,
  type AccountQuery,
  type AccountRecord,
  type BalanceWriteInput,
  type ClearPrimaryInput,
  type DormancyQuery,
  type InsertAccountResult,
  type NewAccount,
} from './account.store.js';

/**
 * An honest, in-memory `AccountStore`.
 *
 * "Honest" is the load-bearing word. It enforces every rule the Mongo repository does —
 * unique account numbers and IBANs, version-conditional balance writes, the same filter
 * semantics on a list — so a test that passes here is testing the service's behaviour
 * rather than the fake's leniency. In particular {@link writeBalances} refuses a write
 * whose `expectedVersion` has moved, which is what makes the concurrency tests real:
 * they exercise the same retry path production takes when Mongo aborts the loser of a
 * write conflict.
 *
 * Shipped in `src` rather than a test folder for the same reason the ledger ships its
 * fakes there: other lanes need an account sink before a replica set is available, and a
 * fake that lives beside its abstraction cannot quietly drift away from it.
 */
@Injectable()
export class InMemoryAccountStore extends AccountStore {
  private readonly byId = new Map<string, AccountRecord>();

  override async insert(account: NewAccount): Promise<InsertAccountResult> {
    const clash = this.conflictFor(account);
    if (clash) return { conflictOn: clash };

    const record: AccountRecord = {
      ...account,
      version: 0,
      closedAt: null,
      dormantAt: null,
      lastActivityAt: account.openedAt,
    };
    this.byId.set(record.id, record);
    return { account: record };
  }

  override async findById(id: string): Promise<AccountRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async findByNumber(number: string): Promise<AccountRecord | null> {
    return this.first((account) => account.number === number);
  }

  override async findByIban(iban: string): Promise<AccountRecord | null> {
    return this.first((account) => account.iban === iban);
  }

  override async listByUser(query: AccountQuery): Promise<AccountRecord[]> {
    return [...this.byId.values()]
      .filter((account) => matches(account, query))
      .sort((left, right) => right.openedAt.getTime() - left.openedAt.getTime());
  }

  override async listDormancyCandidates(query: DormancyQuery): Promise<AccountRecord[]> {
    return [...this.byId.values()]
      .filter(
        (account) =>
          account.status === AccountStatus.ACTIVE &&
          account.lastActivityAt.getTime() < query.quietSince.getTime(),
      )
      .sort((left, right) => left.lastActivityAt.getTime() - right.lastActivityAt.getTime())
      .slice(0, query.limit);
  }

  override async writeBalances(input: BalanceWriteInput): Promise<boolean> {
    const current = this.byId.get(input.accountId);
    if (!current || current.version !== input.expectedVersion) return false;

    this.byId.set(input.accountId, {
      ...current,
      ledgerBalance: toStored(input.ledgerBalance),
      availableBalance: toStored(input.availableBalance),
      holdTotal: toStored(input.holdTotal),
      status: input.status ?? current.status,
      dormantAt: input.dormantAt === undefined ? current.dormantAt : input.dormantAt,
      lastActivityAt: input.lastActivityAt ?? current.lastActivityAt,
      version: current.version + 1,
    });
    return true;
  }

  override async patch(input: AccountPatchInput): Promise<AccountRecord | null> {
    const current = this.byId.get(input.accountId);
    if (!current) return null;
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      return null;
    }

    const { overdraftLimit, ...plain } = input.fields;
    const updated: AccountRecord = {
      ...current,
      ...definedOnly(plain),
      ...(overdraftLimit ? { overdraftLimit: toStored(overdraftLimit) } : {}),
      version: current.version + 1,
    };
    this.byId.set(updated.id, updated);
    return updated;
  }

  override async clearPrimary(input: ClearPrimaryInput): Promise<void> {
    for (const account of this.byId.values()) {
      const affected =
        account.userId === input.userId &&
        account.currency === input.currency &&
        account.isPrimary &&
        account.id !== input.exceptAccountId;

      if (affected) {
        this.byId.set(account.id, { ...account, isPrimary: false, version: account.version + 1 });
      }
    }
  }

  /** Every stored account, for assertions. */
  all(): AccountRecord[] {
    return [...this.byId.values()];
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.byId.clear();
  }

  private conflictFor(account: NewAccount): 'number' | 'iban' | null {
    for (const existing of this.byId.values()) {
      if (existing.number === account.number) return 'number';
      if (existing.iban === account.iban) return 'iban';
    }
    return null;
  }

  private first(predicate: (account: AccountRecord) => boolean): AccountRecord | null {
    return [...this.byId.values()].find((account) => predicate(account)) ?? null;
  }
}

function matches(account: AccountRecord, query: AccountQuery): boolean {
  const held = account.userId === query.userId || account.holderIds.includes(query.userId);
  if (!held) return false;
  if (query.status && account.status !== query.status) return false;
  if (query.type && account.type !== query.type) return false;
  return !query.currency || account.currency === query.currency;
}

/**
 * Drops keys whose value is `undefined`.
 *
 * A spread copies `{ nickname: undefined }` over a real nickname, which would make a
 * patch that never mentioned the field silently erase it — the exact bug `$set` cannot
 * have, and therefore the exact bug this fake must not have either.
 */
function definedOnly<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
