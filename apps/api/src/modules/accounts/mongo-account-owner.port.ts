import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AccountOwnerPort } from '../transactions/ports/account-owner.port.js';

import { AccountStore } from './account.store.js';

/**
 * {@link AccountOwnerPort} against the real `accounts` collection.
 *
 * The transactions module declares the port; this module owns the collection behind it,
 * which is the direction the dependency has to run — a transaction row needs an owner, and
 * only accounts knows who that is.
 *
 * ## Why this exists
 *
 * The binding was left on `InMemoryAccountOwnerPort` — a placeholder whose map is empty in
 * any process that did not explicitly register an account. Nothing failed loudly enough to
 * notice: the projector's contract is to skip a row it cannot attribute and log, precisely
 * so a booked ledger entry is never aborted over a missing view. So every posting wrote a
 * correct journal entry, moved the right balance, and produced no statement line. The
 * showcase generated 3,033 entries and an activity feed with nothing on it.
 *
 * That is the failure mode a stub in the production graph always has. It is honest about
 * not knowing, and being honest at error level 3,095 times is indistinguishable from noise.
 *
 * ## Who counts as the owner
 *
 * `userId` — the primary holder — not `holderIds`. A joint account has several people who
 * may operate it, and each of them sees it in their own feed, but the row carries one
 * attribution and it is the account's own. Widening this to a joint holder would double a
 * joint transaction across two feeds and double-count it in every total built from them.
 */
@Injectable()
export class MongoAccountOwnerPort extends AccountOwnerPort {
  constructor(private readonly accounts: AccountStore) {
    super();
  }

  override async ownerOf(accountId: string, session?: ClientSession): Promise<string | null> {
    const account = await this.accounts.findById(accountId, session);
    return account?.userId ?? null;
  }
}
