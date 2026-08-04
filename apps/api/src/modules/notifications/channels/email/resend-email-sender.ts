/**
 * Resend implementation of {@link EmailSenderPort}.
 *
 * Two details carry weight.
 *
 * **Idempotency.** Every send carries the delivery-row id as its idempotency key. The
 * retry sweep exists precisely to re-attempt a send whose outcome we never learned, and
 * without a key that means a customer receives the same payment confirmation twice when
 * the first one actually went out and only the acknowledgement was lost.
 *
 * **Failure classification.** A 4xx from the API is our fault and will be our fault again
 * on the fifth attempt; a 5xx or a timeout is theirs and probably will not be. Getting
 * this the wrong way round is what turns one bad address into a sending reputation
 * problem, so the mapping is explicit rather than "retry everything".
 */

import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

import { AppConfigService } from '../../../../config/config.service.js';

import { EmailSenderPort, type EmailSendResult, type OutboundEmail } from './email-sender.port.js';

const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;

/** Error names Resend returns that no number of retries will change. */
const PERMANENT_ERROR_NAMES: readonly string[] = Object.freeze([
  'validation_error',
  'invalid_parameter',
  'invalid_from_address',
  'invalid_to_address',
  'missing_required_field',
  'restricted_api_key',
  'not_found',
]);

@Injectable()
export class ResendEmailSender extends EmailSenderPort {
  readonly transportName = 'resend';

  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly client: Resend;

  constructor(private readonly config: AppConfigService) {
    super();
    this.client = new Resend(this.config.email.apiKey);
  }

  override async send(email: OutboundEmail): Promise<EmailSendResult> {
    try {
      const response = await this.client.emails.send(
        {
          from: this.config.email.from,
          to: email.to,
          replyTo: this.config.email.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(email.headers ? { headers: { ...email.headers } } : {}),
          ...(email.tags ? { tags: toResendTags(email.tags) } : {}),
        },
        { idempotencyKey: email.idempotencyKey },
      );

      if (response.error) return classify(response.error);
      return { ok: true, providerMessageId: response.data?.id ?? null };
    } catch (error) {
      // A thrown error here is a transport failure — DNS, TLS, a socket timeout. None of
      // those say anything about the message, so all of them are worth another attempt.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email transport failed for ${maskAddress(email.to)}: ${reason}`);
      return { ok: false, permanent: false, reason };
    }
  }
}

function classify(error: {
  name: string;
  message: string;
  statusCode: number | null;
}): EmailSendResult {
  const status = error.statusCode ?? SERVER_ERROR_FLOOR;
  const permanent =
    PERMANENT_ERROR_NAMES.includes(error.name) ||
    (status >= CLIENT_ERROR_FLOOR && status < SERVER_ERROR_FLOOR);

  return { ok: false, permanent, reason: `${error.name}: ${error.message}` };
}

function toResendTags(tags: Readonly<Record<string, string>>): { name: string; value: string }[] {
  return Object.entries(tags).map(([name, value]) => ({ name, value }));
}

/** Never log a whole address; the local part is enough to correlate. */
function maskAddress(address: string): string {
  const [local, domain] = address.split('@');
  if (!local || !domain) return '(address withheld)';
  return `${local.slice(0, 2)}***@${domain}`;
}
