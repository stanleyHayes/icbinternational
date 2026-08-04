/**
 * Capturing enquiries and newsletter sign-ups.
 *
 * Three defences on a form anyone on the internet can post to, and none of them tells the
 * submitter which one caught them:
 *
 * - **A honeypot field** the contract already defines. A real browser leaves `website`
 *   empty; a form-filling bot fills every input it finds.
 * - **Idempotency within a day**, so a double-click is one lead rather than two.
 * - **A rate limit** applied by the guard on the route.
 *
 * A rejected submission is acknowledged as though it succeeded. Telling a bot it was
 * detected tells it what to change.
 */

import { Injectable, Logger } from '@nestjs/common';

import { type LeadRequest } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';

import { LeadKind, LeadStore, type LeadRecord } from './lead.store.js';

const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = 3_600_000;

export interface CaptureResult {
  /** Always true on the wire. Whether a record was written is not the submitter's business. */
  readonly received: true;
}

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  constructor(
    private readonly leads: LeadStore,
    private readonly clock: ClockService,
  ) {}

  /** Records an enquiry from the contact form. */
  async captureEnquiry(request: LeadRequest, sourceIp: string | null): Promise<CaptureResult> {
    if (request.website) {
      this.logger.debug('Discarded a submission that filled the honeypot field');
      return { received: true };
    }

    await this.record({
      kind: LeadKind.ENQUIRY,
      name: request.name,
      email: request.email,
      phone: request.phone ?? null,
      interest: request.interest,
      message: request.message ?? null,
      sourceIp,
    });

    return { received: true };
  }

  /** Records a newsletter sign-up. */
  async captureNewsletter(email: string, sourceIp: string | null): Promise<CaptureResult> {
    await this.record({
      kind: LeadKind.NEWSLETTER,
      name: null,
      email,
      phone: null,
      interest: null,
      message: null,
      sourceIp,
    });

    return { received: true };
  }

  /**
   * Writes the lead unless the same address submitted the same kind within a day.
   *
   * No acknowledgement email is sent, and this service has no dependency on the
   * notification platform. The address is unverified — anybody can type anybody's — and
   * mailing an unverified address on an anonymous submission turns a contact form into a
   * way of sending mail to strangers under the bank's name. A member of staff picks the
   * enquiry up from the admin console instead.
   */
  private async record(lead: {
    kind: LeadKind;
    name: string | null;
    email: string;
    phone: string | null;
    interest: string | null;
    message: string | null;
    sourceIp: string | null;
  }): Promise<LeadRecord | null> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - HOURS_PER_DAY * MILLISECONDS_PER_HOUR);

    const duplicate = await this.leads.findRecent(lead.email, lead.kind, since);
    if (duplicate) return duplicate;

    return this.leads.capture(lead, now);
  }
}
