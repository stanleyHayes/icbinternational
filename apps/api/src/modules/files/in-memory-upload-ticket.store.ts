import { Injectable } from '@nestjs/common';

import {
  UploadTicketStore,
  type ClaimUploadTicketInput,
  type NewUploadTicket,
  type UploadTicketRecord,
} from './upload-ticket.store.js';

/**
 * In-process upload tickets.
 *
 * Enforces the same three conditions the Mongo update filter does — right caller, not yet
 * claimed, not yet expired — so a test that gets a foreign key confirmed here would get it
 * confirmed in production too. The claim is a read and a write with no `await` between
 * them, which on a single-threaded event loop is the same atomicity Mongo's conditional
 * update gives us.
 */
@Injectable()
export class InMemoryUploadTicketStore extends UploadTicketStore {
  private readonly byStorageKey = new Map<string, UploadTicketRecord>();

  override async issue(ticket: NewUploadTicket): Promise<UploadTicketRecord> {
    const record: UploadTicketRecord = { ...ticket, claimedAt: null };
    this.byStorageKey.set(record.storageKey, record);
    return record;
  }

  override async claim(input: ClaimUploadTicketInput): Promise<UploadTicketRecord | null> {
    const ticket = this.byStorageKey.get(input.storageKey);
    if (!ticket) return null;
    if (ticket.ownerId !== input.ownerId) return null;
    if (ticket.claimedAt !== null) return null;
    if (ticket.expiresAt.getTime() <= input.now.getTime()) return null;

    const claimed: UploadTicketRecord = { ...ticket, claimedAt: input.now };
    this.byStorageKey.set(claimed.storageKey, claimed);
    return claimed;
  }
}
