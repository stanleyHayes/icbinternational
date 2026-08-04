import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { BaseRepository } from '../../../database/base.repository.js';
import { LEAD_MODEL } from '../public.constants.js';

import { type LeadSchemaClass } from './lead.schema.js';
import { LeadStore, type LeadKind, type LeadRecord, type NewLead } from './lead.store.js';

/** Mongo-backed lead capture. */
@Injectable()
export class LeadRepository extends BaseRepository<LeadSchemaClass> implements LeadStore {
  constructor(
    @InjectModel(LEAD_MODEL) model: Model<LeadSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async capture(lead: NewLead, at: Date): Promise<LeadRecord> {
    const created = await this.create({
      ...lead,
      email: lead.email.toLowerCase(),
      id: this.ids.generate('case'),
      createdAt: at,
    });
    return toRecord(created.toObject());
  }

  async findRecent(email: string, kind: LeadKind, since: Date): Promise<LeadRecord | null> {
    const found = await this.findOne({
      email: email.toLowerCase(),
      kind,
      createdAt: { $gte: since },
    });
    return found ? toRecord(found.toObject()) : null;
  }
}

function toRecord(document: LeadSchemaClass): LeadRecord {
  return {
    id: document.id,
    kind: document.kind,
    name: document.name,
    email: document.email,
    phone: document.phone,
    interest: document.interest,
    message: document.message,
    sourceIp: document.sourceIp,
    createdAt: document.createdAt,
  };
}
