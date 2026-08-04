import { Injectable } from '@nestjs/common';

import { AccountOwnerPort } from './account-owner.port.js';

/**
 * An in-memory {@link AccountOwnerPort}, used until the accounts module binds a real one.
 *
 * It is honest in the one way that matters: an account nobody registered has no owner,
 * and it says so rather than inventing a plausible id. A fake that answered every lookup
 * would hide exactly the failure this port exists to surface — a projection attributed to
 * the wrong customer.
 *
 * Shipped in `src` because the seed and simulation workstreams need an owner lookup
 * before B-04 lands, and because a fake that lives beside its port cannot drift from it.
 */
@Injectable()
export class InMemoryAccountOwnerPort extends AccountOwnerPort {
  private readonly owners = new Map<string, string>();

  /** Registers an account against its owner. Mirrors "open an account". */
  register(accountId: string, userId: string): void {
    this.owners.set(accountId, userId);
  }

  override async ownerOf(accountId: string): Promise<string | null> {
    return this.owners.get(accountId) ?? null;
  }

  /** Empties the map. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.owners.clear();
  }
}
