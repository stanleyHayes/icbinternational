/**
 * How the notification platform learns who it is writing to.
 *
 * A port rather than a direct dependency on the users module, for two reasons. It keeps
 * the delivery tests free of a user collection — the interesting cases are about muted
 * categories and bounced addresses, not about how a customer record is stored. And it
 * makes explicit exactly what this platform is allowed to know about a person: a name to
 * address them by, and the two channels they can be reached on. Nothing else.
 */

export interface Recipient {
  readonly userId: string;
  readonly displayName: string;
  readonly firstName: string;
  /** Null when unverified. We do not send to an address the customer has not confirmed. */
  readonly emailAddress: string | null;
  /** E.164, null when unverified. */
  readonly phoneNumber: string | null;
  readonly locale: string;
}

export abstract class RecipientPort {
  /** Resolves a customer, or `null` when there is no such customer. */
  abstract find(userId: string): Promise<Recipient | null>;
}
