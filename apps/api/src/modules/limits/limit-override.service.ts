import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { type LimitScope } from '../products/index.js';

import { type LimitOverride } from './limit-override.js';
import { toOverrideView, type LimitOverrideView } from './limit-override.mapper.js';
import { LimitOverrideRepository } from './limit-override.repository.js';
import { ANY_CHANNEL, MAX_OVERRIDE_DAYS, OVERRIDE_ID_PREFIX } from './limits.constants.js';
import { type CreateLimitOverrideRequest } from './limits.dto.js';

/** What the service needs to know about the admin granting the override. */
export interface OverrideActor {
  readonly id: string;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Granting and ending limit overrides.
 *
 * Every rule about what makes a grant valid lives here rather than in the controller:
 * an expiry in the past, an expiry beyond the maximum life, or caps denominated in a
 * different currency than the override claims are all refused before anything persists.
 */
@Injectable()
export class LimitOverrideService {
  constructor(
    private readonly overrides: LimitOverrideRepository,
    private readonly clock: ClockService,
  ) {}

  /** Grants an override after validating its shape against the current time. */
  async grant(
    request: CreateLimitOverrideRequest,
    actor: OverrideActor,
  ): Promise<LimitOverrideView> {
    const expiresAt = new Date(request.expiresAt);
    assertExpiryWindow(expiresAt, this.clock.now());
    assertSingleCurrency(request);

    const override: LimitOverride = {
      id: `${OVERRIDE_ID_PREFIX}_${ulid()}`,
      accountId: request.accountId,
      scope: request.scope as LimitScope,
      channel: request.channel ?? ANY_CHANNEL,
      currency: request.currency,
      perTransaction: request.perTransaction?.amount ?? null,
      daily: request.daily?.amount ?? null,
      monthly: request.monthly?.amount ?? null,
      dailyCount: request.dailyCount ?? null,
      reason: request.reason,
      expiresAt,
      revokedAt: null,
      createdBy: actor.id,
      createdAt: this.clock.now(),
    };

    return toOverrideView(await this.overrides.insert(override));
  }

  /** Ends a grant early. Idempotent in effect, honest in response: the second revoke 404s. */
  async revoke(id: string): Promise<LimitOverrideView> {
    const revoked = await this.overrides.revoke(id, this.clock.now());
    if (!revoked) {
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        message: `No live limit override ${id} was found`,
      });
    }
    return toOverrideView(revoked);
  }

  /** The full grant history of an account, newest first, live and expired alike. */
  async listForAccount(accountId: string): Promise<LimitOverrideView[]> {
    const documents = await this.overrides.listForAccount(accountId);
    return documents.map(toOverrideView);
  }
}

/** An override must start in the future and end within the maximum life. */
function assertExpiryWindow(expiresAt: Date, now: Date): void {
  if (expiresAt.getTime() <= now.getTime()) {
    throw AppError.validation('An override must expire in the future', [
      { path: 'expiresAt', message: 'The expiry is not in the future' },
    ]);
  }

  const lifeMs = expiresAt.getTime() - now.getTime();
  if (lifeMs > MAX_OVERRIDE_DAYS * MILLISECONDS_PER_DAY) {
    throw AppError.validation(`An override may not outlive ${MAX_OVERRIDE_DAYS} days`, [
      { path: 'expiresAt', message: `Expiry is more than ${MAX_OVERRIDE_DAYS} days away` },
    ]);
  }
}

/** Every money cap must be denominated in the override's declared currency. */
function assertSingleCurrency(request: CreateLimitOverrideRequest): void {
  const caps = [request.perTransaction, request.daily, request.monthly];
  const foreign = caps.find((cap) => cap && cap.currency !== request.currency);
  if (!foreign) return;

  throw AppError.validation('All caps on an override must share one currency', [
    {
      path: 'currency',
      message: `A cap is in ${foreign.currency} but the override is ${request.currency}`,
    },
  ]);
}
