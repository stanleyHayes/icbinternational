/**
 * The transport used when no email provider is configured.
 *
 * It writes the rendered message to the application log and reports success. That is a
 * deliberate design decision rather than a stub: a developer with no API key should be
 * able to run onboarding, receive a verification "email", read the code out of their
 * terminal and finish the flow. Disabling the notification platform when a key is absent
 * would make the most valuable path in the product the one that is hardest to exercise.
 *
 * It logs the plain-text alternative, not the HTML — a terminal is a text client, and the
 * text part exists precisely for readers like it.
 */

import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { EmailSenderPort, type EmailSendResult, type OutboundEmail } from './email-sender.port.js';

@Injectable()
export class LoggingEmailSender extends EmailSenderPort {
  readonly transportName = 'log';

  private readonly logger = new Logger('OutboundEmail');

  override async send(email: OutboundEmail): Promise<EmailSendResult> {
    this.logger.log(
      [
        '',
        `To:      ${email.toName} <${email.to}>`,
        `Subject: ${email.subject}`,
        '',
        email.text.trim(),
        '',
      ].join('\n'),
    );

    return { ok: true, providerMessageId: `log_${randomUUID()}` };
  }
}
