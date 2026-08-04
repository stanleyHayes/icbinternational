/**
 * Persistence for enquiries and newsletter sign-ups.
 *
 * The only writes the public surface makes, and the only records it creates. Deliberately
 * a separate collection from anything a customer owns: a lead is a person who is not our
 * customer, and keeping the two apart means a bug in a public endpoint cannot reach a
 * customer record because there is no relationship to traverse.
 */

export const LeadKind = {
  ENQUIRY: 'ENQUIRY',
  NEWSLETTER: 'NEWSLETTER',
} as const;
export type LeadKind = (typeof LeadKind)[keyof typeof LeadKind];

export interface LeadRecord {
  readonly id: string;
  readonly kind: LeadKind;
  readonly name: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly interest: string | null;
  readonly message: string | null;
  /** Kept for a fraud investigation, and for nothing else. */
  readonly sourceIp: string | null;
  readonly createdAt: Date;
}

export type NewLead = Omit<LeadRecord, 'id' | 'createdAt'>;

export abstract class LeadStore {
  /**
   * Records an enquiry.
   *
   * Idempotent per `{kind, email}` within a day: a person who submits the form twice is
   * not two leads, and the duplicate is the most common consequence of an impatient
   * double-click rather than of genuine interest.
   */
  abstract capture(lead: NewLead, at: Date): Promise<LeadRecord>;

  abstract findRecent(email: string, kind: LeadKind, since: Date): Promise<LeadRecord | null>;
}
