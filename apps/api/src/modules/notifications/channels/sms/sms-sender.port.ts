/**
 * The SMS transport seam.
 *
 * Reliance Bank does not hold a contract with an aggregator, so the shipped implementation
 * records the message and reports it as accepted. The port exists so that adding one is a
 * new adapter and a line in a module, with nothing else in the platform aware it happened.
 *
 * A text message is the most expensive channel per recipient and the least private —
 * it is readable on a lock screen — so the platform never sends the body of a security
 * message down it, only a one-line summary. {@link SMS_BODY_LIMIT} is enforced here rather
 * than left to the aggregator, because a message silently split into three parts costs
 * three times as much and arrives out of order.
 */

/** A single GSM-7 segment. Longer bodies are truncated on a word boundary. */
export const SMS_BODY_LIMIT = 160;

export interface OutboundSms {
  /** E.164, e.g. `+447700900123`. */
  readonly to: string;
  readonly body: string;
  readonly deliveryId: string;
}

export type SmsSendResult =
  | { readonly ok: true; readonly providerMessageId: string | null }
  | { readonly ok: false; readonly permanent: boolean; readonly reason: string };

export abstract class SmsSenderPort {
  abstract readonly transportName: string;

  abstract send(message: OutboundSms): Promise<SmsSendResult>;
}

/** Trims a body to one segment without cutting a word in half. */
export function toSingleSegment(body: string): string {
  const collapsed = body.replaceAll(/\s+/g, ' ').trim();
  if (collapsed.length <= SMS_BODY_LIMIT) return collapsed;

  const clipped = collapsed.slice(0, SMS_BODY_LIMIT - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}
