/**
 * Rate limiting for the unauthenticated surface.
 *
 * A fixed window keyed on the caller's address, held in process. Two honest limitations,
 * both stated rather than papered over:
 *
 * - **Per instance.** Two API instances allow twice the limit. For a surface whose whole
 *   purpose is to sit behind a CDN, that is acceptable; the CDN absorbs the volume this
 *   guard exists to bound. A Redis-backed counter belongs behind this same interface
 *   before the origin is exposed directly, and there is a handoff note saying so.
 * - **A fixed window, not a sliding one.** A caller can spend the whole budget at the end
 *   of one window and again at the start of the next. That doubling is bounded and
 *   uninteresting for a read surface.
 *
 * It is not the security control on this module — that is the absence of any path to
 * customer data. This is here so an enthusiastic scraper does not make the origin slow
 * for everyone else.
 */

import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_SECONDS } from './public.constants.js';

const LIMIT_METADATA = 'reliance:public-rate-limit';
const MILLISECONDS_PER_SECOND = 1000;

/** Entries swept once the map passes this size, so it cannot grow without bound. */
const SWEEP_THRESHOLD = 10_000;

/** Bucket for a request Express could not attribute to any address. */
const UNKNOWN_CALLER = 'unknown';

export interface RateLimitOptions {
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Overrides the default budget for one route. */
export function RateLimit(options: RateLimitOptions): MethodDecorator {
  return SetMetadata(LIMIT_METADATA, options);
}

interface Window {
  count: number;
  resetAtMs: number;
}

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly reflector: Reflector,
    private readonly clock: ClockService,
  ) {}

  /**
   * @throws {AppError} `RATE_LIMITED` with a `Retry-After`, so a well-behaved client knows
   *   exactly when to come back rather than guessing.
   */
  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      LIMIT_METADATA,
      context.getHandler(),
    ) ?? {
      limit: PUBLIC_RATE_LIMIT,
      windowSeconds: PUBLIC_RATE_WINDOW_SECONDS,
    };

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const key = `${callerKey(request)}:${context.getHandler().name}`;

    const now = this.clock.timestamp();
    const window = this.windowFor(key, now, options);
    window.count += 1;

    const remaining = Math.max(0, options.limit - window.count);
    this.describe(http.getResponse<Response>(), options, remaining, window.resetAtMs);

    if (window.count <= options.limit) return true;

    throw new AppError({
      code: ErrorCode.RATE_LIMITED,
      message: 'You have made too many requests. Please wait a moment and try again.',
      status: HttpStatus.TOO_MANY_REQUESTS,
      retryAfterSeconds: secondsUntil(window.resetAtMs, now),
    });
  }

  private windowFor(key: string, now: number, options: RateLimitOptions): Window {
    const existing = this.windows.get(key);
    if (existing && existing.resetAtMs > now) return existing;

    if (this.windows.size > SWEEP_THRESHOLD) this.sweep(now);

    const fresh: Window = {
      count: 0,
      resetAtMs: now + options.windowSeconds * MILLISECONDS_PER_SECOND,
    };
    this.windows.set(key, fresh);
    return fresh;
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAtMs <= now) this.windows.delete(key);
    }
  }

  private describe(
    response: Response,
    options: RateLimitOptions,
    remaining: number,
    resetAtMs: number,
  ): void {
    response.setHeader('RateLimit-Limit', String(options.limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(secondsUntil(resetAtMs, this.clock.timestamp())));
  }
}

function secondsUntil(instantMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((instantMs - nowMs) / MILLISECONDS_PER_SECOND));
}

/**
 * Who is calling.
 *
 * `request.ip`, never the header. Express already knows whether `X-Forwarded-For` may be
 * believed — that is what `trust proxy` decides, set once in `main.ts` from `TRUST_PROXY`
 * and off by default. Reading the header here would ignore that decision and key the
 * budget on a value the caller writes, so rotating it would reset the budget on every
 * request and the limiter would bound nothing.
 *
 * With no address at all — a socket that has already gone away, or a non-HTTP transport —
 * every such caller shares one bucket. Sharing is the safe direction to fail: it can only
 * be stricter than the truth, never more permissive.
 */
function callerKey(request: Request): string {
  return request.ip ?? UNKNOWN_CALLER;
}
