import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { type Request } from 'express';

import { ClockService } from '../../../../common/clock/clock.service.js';
import { AppError } from '../../../../common/errors/app-error.js';
import { AppConfigService } from '../../../../config/config.service.js';
import { emailWebhookEventSchema, EMAIL_WEBHOOK_ROUTE } from '../../notifications.dto.js';

import { EmailWebhookService } from './email-webhook.service.js';
import { verifyWebhookSignature } from './webhook-signature.js';

/** Svix header names, as the provider sends them. */
const HEADER = {
  id: 'svix-id',
  timestamp: 'svix-timestamp',
  signature: 'svix-signature',
} as const;

/** A request carrying the raw body the signature was computed over. */
type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Delivery events from the email provider.
 *
 * Unauthenticated by necessity — the provider has no session with us — and therefore
 * signature-verified without exception. An unverified caller here could mark any
 * customer's address as bounced, which would quietly stop that customer's security
 * emails, so an unsigned request is refused rather than logged and processed.
 *
 * Always answers `200` once the signature is accepted, including for event types we do not
 * act on. A non-2xx makes the provider retry, and retrying an event we will never
 * understand helps nobody.
 */
@Controller()
export class EmailWebhookController {
  constructor(
    private readonly webhooks: EmailWebhookService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  @Post(EMAIL_WEBHOOK_ROUTE)
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest,
    @Headers(HEADER.id) id: string | undefined,
    @Headers(HEADER.timestamp) timestamp: string | undefined,
    @Headers(HEADER.signature) signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    this.assertAuthentic({ request, id, timestamp, signature });

    const parsed = emailWebhookEventSchema.safeParse(body);
    if (!parsed.success) return { received: true };

    await this.webhooks.ingest(parsed.data);
    return { received: true };
  }

  /** @throws {AppError} `FORBIDDEN` when the request is not provably from the provider. */
  private assertAuthentic(input: {
    request: RawBodyRequest;
    id: string | undefined;
    timestamp: string | undefined;
    signature: string | undefined;
  }): void {
    if (!input.id || !input.timestamp || !input.signature) {
      throw AppError.forbidden('This request is not signed.');
    }

    const result = verifyWebhookSignature({
      rawBody: input.request.rawBody?.toString('utf8') ?? JSON.stringify(input.request.body),
      headers: { id: input.id, timestamp: input.timestamp, signature: input.signature },
      secret: this.config.email.webhookSecret,
      now: this.clock.now(),
    });

    if (!result.valid) throw AppError.forbidden('This request could not be verified.');
  }
}
