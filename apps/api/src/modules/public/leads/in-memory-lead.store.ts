import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../../common/ids/id-generator.js';

import { LeadStore, type LeadKind, type LeadRecord, type NewLead } from './lead.store.js';

/** In-process lead capture. */
@Injectable()
export class InMemoryLeadStore extends LeadStore {
  private readonly leads: LeadRecord[] = [];

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async capture(lead: NewLead, at: Date): Promise<LeadRecord> {
    const record: LeadRecord = {
      ...lead,
      email: lead.email.toLowerCase(),
      id: this.ids.generate('case'),
      createdAt: at,
    };
    this.leads.push(record);
    return record;
  }

  override async findRecent(
    email: string,
    kind: LeadKind,
    since: Date,
  ): Promise<LeadRecord | null> {
    const needle = email.toLowerCase();
    return (
      this.leads.find(
        (lead) =>
          lead.email === needle &&
          lead.kind === kind &&
          lead.createdAt.getTime() >= since.getTime(),
      ) ?? null
    );
  }

  /** Everything captured so far. Test affordance. */
  get captured(): readonly LeadRecord[] {
    return this.leads;
  }
}
