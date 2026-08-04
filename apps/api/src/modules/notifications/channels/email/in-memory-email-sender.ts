/**
 * An {@link EmailSenderPort} that keeps everything it is given.
 *
 * Tests assert on the message a customer would actually have received — its subject, the
 * code inside it, whether a security notice went out despite the category being muted —
 * rather than on the arguments a stub was called with. Those are not the same assertion,
 * and only the first one fails when the copy is wrong.
 *
 * It can also be told to fail, so retry and degradation behaviour is exercised against a
 * transport that refuses in the shape a real one refuses in.
 */

import { Injectable } from '@nestjs/common';

import { EmailSenderPort, type EmailSendResult, type OutboundEmail } from './email-sender.port.js';

export interface CapturedEmail extends OutboundEmail {
  readonly providerMessageId: string;
}

@Injectable()
export class InMemoryEmailSender extends EmailSenderPort {
  readonly transportName = 'in-memory';

  private readonly captured: CapturedEmail[] = [];
  private nextFailure: { permanent: boolean; reason: string } | null = null;
  private sequence = 0;

  override async send(email: OutboundEmail): Promise<EmailSendResult> {
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      return { ok: false, permanent: failure.permanent, reason: failure.reason };
    }

    // Idempotency is part of the contract this twin stands in for: the same key must not
    // produce a second message, because the retry sweep will present one.
    const existing = this.captured.find((entry) => entry.idempotencyKey === email.idempotencyKey);
    if (existing) return { ok: true, providerMessageId: existing.providerMessageId };

    this.sequence += 1;
    const providerMessageId = `mem_${this.sequence}`;
    this.captured.push({ ...email, providerMessageId });
    return { ok: true, providerMessageId };
  }

  /** Everything sent so far, oldest first. */
  get outbox(): readonly CapturedEmail[] {
    return this.captured;
  }

  /** The most recent message to an address, or `undefined`. */
  lastTo(address: string): CapturedEmail | undefined {
    return [...this.captured].reverse().find((entry) => entry.to === address);
  }

  /** Makes the next send fail once. */
  failNext(reason: string, permanent = false): void {
    this.nextFailure = { permanent, reason };
  }

  clear(): void {
    this.captured.length = 0;
    this.nextFailure = null;
  }
}
