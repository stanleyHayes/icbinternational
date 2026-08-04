import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { UPLOAD_TICKET_MODEL } from './files.constants.js';
import { type UploadTicketSchemaClass } from './upload-ticket.schema.js';
import {
  UploadTicketStore,
  type ClaimUploadTicketInput,
  type NewUploadTicket,
  type UploadTicketRecord,
} from './upload-ticket.store.js';

/**
 * Mongo-backed upload tickets.
 *
 * {@link claim} is the only mutation, and it is conditional on the ticket still being
 * unclaimed, unexpired, and the caller's. Everything the confirm step is allowed to assume
 * about who owns an upload hangs off that one atomic transition.
 */
@Injectable()
export class UploadTicketRepository
  extends BaseRepository<UploadTicketSchemaClass>
  implements UploadTicketStore
{
  constructor(@InjectModel(UPLOAD_TICKET_MODEL) model: Model<UploadTicketSchemaClass>) {
    super(model);
  }

  async issue(ticket: NewUploadTicket): Promise<UploadTicketRecord> {
    const created = await this.create({ ...ticket, claimedAt: null });
    return toRecord(created.toObject());
  }

  async claim(input: ClaimUploadTicketInput): Promise<UploadTicketRecord | null> {
    const claimed = await this.updateOne(
      {
        storageKey: input.storageKey,
        ownerId: input.ownerId,
        claimedAt: null,
        expiresAt: { $gt: input.now },
      },
      { $set: { claimedAt: input.now } },
    );

    return claimed ? toRecord(claimed.toObject()) : null;
  }
}

function toRecord(document: UploadTicketSchemaClass): UploadTicketRecord {
  return {
    storageKey: document.storageKey,
    ownerId: document.ownerId,
    purpose: document.purpose,
    issuedAt: document.issuedAt,
    expiresAt: document.expiresAt,
    claimedAt: document.claimedAt,
  };
}
