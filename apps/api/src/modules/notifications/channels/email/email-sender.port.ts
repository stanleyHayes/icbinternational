/**
 * The seam between the bank and whoever actually puts an email on the wire.
 *
 * Three implementations sit behind it and the choice is made once, at boot, from
 * configuration:
 *
 * - `ResendEmailSender` when `RESEND_API_KEY` is set.
 * - `LoggingEmailSender` when it is not, so a developer sees the rendered message on
 *   stdout and the whole notification platform still runs end to end.
 * - `InMemoryEmailSender` in tests, which keeps every message so an assertion can be made
 *   about what was sent rather than about what a stub was called with.
 *
 * The port speaks in messages, not in a provider's request shape. Swapping Resend for
 * another provider is a new adapter and nothing else.
 */

export interface OutboundEmail {
  readonly to: string;
  readonly toName: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Correlates the provider's webhook with our delivery row. */
  readonly idempotencyKey: string;
  /** `List-Unsubscribe` and friends. Absent on mandatory security mail. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly tags?: Readonly<Record<string, string>>;
}

export type EmailSendResult =
  | { readonly ok: true; readonly providerMessageId: string | null }
  | { readonly ok: false; readonly permanent: boolean; readonly reason: string };

export abstract class EmailSenderPort {
  /** Names the transport in logs and in the operations console. */
  abstract readonly transportName: string;

  abstract send(email: OutboundEmail): Promise<EmailSendResult>;
}
