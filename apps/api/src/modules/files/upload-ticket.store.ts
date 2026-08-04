/**
 * Persistence boundary for upload tickets.
 *
 * A signed-upload handshake hands the browser a key and a signature and then hears nothing
 * until a `confirm` arrives quoting that key. Without a record of who was issued which key,
 * `confirm` has no way to tell the customer who uploaded the object from anyone else who
 * has learned its key — so the asset would be registered under whoever asked first. The
 * ticket is that record, and claiming it is what makes the confirm attributable.
 *
 * Claiming is a single conditional write rather than a read followed by a write. Two
 * confirms racing on one key both find the ticket live; exactly one may claim it.
 */

import { type AssetPurpose } from './files.constants.js';

/** A ticket as services see it — a plain value, with no `.save()` on it. */
export interface UploadTicketRecord {
  /** The provider-side key the signature was issued for. Unique across tickets. */
  readonly storageKey: string;
  /** The customer the ticket was issued to. The only caller who may confirm it. */
  readonly ownerId: string;
  /**
   * What the upload was signed for.
   *
   * The confirm reads the purpose from here rather than from the request, because purpose
   * decides visibility: a caller free to name it could have an identity document filed as
   * public content media.
   */
  readonly purpose: AssetPurpose;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /** When the ticket was spent by a confirm. Null while it is still claimable. */
  readonly claimedAt: Date | null;
}

/** A ticket on its way out: not yet spent. */
export type NewUploadTicket = Omit<UploadTicketRecord, 'claimedAt'>;

export interface ClaimUploadTicketInput {
  readonly storageKey: string;
  /** Claimed on behalf of this caller; a ticket issued to anyone else does not match. */
  readonly ownerId: string;
  readonly now: Date;
}

export abstract class UploadTicketStore {
  /** Records a ticket the storage provider has just been asked to honour. */
  abstract issue(ticket: NewUploadTicket): Promise<UploadTicketRecord>;

  /**
   * Spends the live ticket for this key and caller, if there is one.
   *
   * Returns null when no ticket exists for the key, when it belongs to another customer,
   * when it has expired, or when it has already been claimed. The caller cannot tell those
   * apart, which is deliberate: distinguishing them would confirm that somebody else's
   * upload key is real.
   */
  abstract claim(input: ClaimUploadTicketInput): Promise<UploadTicketRecord | null>;
}
