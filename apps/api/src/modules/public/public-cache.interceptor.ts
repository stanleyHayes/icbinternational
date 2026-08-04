/**
 * Cache headers and entity tags for the public surface.
 *
 * The marketing site is read by far more people than the bank has customers, and every one
 * of those reads is of content that changes a few times a week. Serving it from a CDN is
 * not an optimisation, it is the difference between a rate change costing nothing and
 * costing an origin outage.
 *
 * `stale-while-revalidate` is the important part: the edge keeps serving the last good
 * copy while it fetches a new one, so the site stays up through a deployment or a database
 * hiccup. A marketing page that 503s because the API is restarting is a worse outcome than
 * one that is five minutes out of date.
 *
 * The ETag is a hash of the body, so a client that already has the current copy gets a 304
 * with no body at all.
 */

import { createHash } from 'node:crypto';

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';
import { map, type Observable } from 'rxjs';

import { CONTENT_MAX_AGE_SECONDS, CONTENT_STALE_SECONDS } from './public.constants.js';

const CACHE_METADATA = 'reliance:public-cache';
const NOT_MODIFIED = 304;

export interface PublicCacheOptions {
  readonly maxAgeSeconds: number;
  readonly staleSeconds?: number;
}

/** Declares how long a public route's response may be cached. */
export function PublicCache(options: PublicCacheOptions): MethodDecorator {
  return SetMetadata(CACHE_METADATA, options);
}

@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<PublicCacheOptions | undefined>(
      CACHE_METADATA,
      context.getHandler(),
    ) ?? {
      maxAgeSeconds: CONTENT_MAX_AGE_SECONDS,
      staleSeconds: CONTENT_STALE_SECONDS,
    };

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((body: unknown) => {
        applyHeaders(response, options);

        const etag = weakEtag(body);
        response.setHeader('ETag', etag);

        // A conditional request that already has this copy gets no body. Returning the
        // body anyway would make the header decorative.
        if (request.headers['if-none-match'] === etag) {
          response.status(NOT_MODIFIED);
          return null;
        }

        return body;
      }),
    );
  }
}

function applyHeaders(response: Response, options: PublicCacheOptions): void {
  const stale = options.staleSeconds ?? CONTENT_STALE_SECONDS;

  response.setHeader(
    'Cache-Control',
    `public, max-age=${options.maxAgeSeconds}, s-maxage=${options.maxAgeSeconds}, stale-while-revalidate=${stale}`,
  );

  // The response varies by encoding only. Saying so explicitly stops an intermediary
  // guessing and fragmenting the cache by something irrelevant, such as User-Agent.
  response.setHeader('Vary', 'Accept-Encoding');
}

/** Enough of the digest to make a collision irrelevant for cache validation. */
const ETAG_LENGTH = 27;

/**
 * A weak entity tag over the response body.
 *
 * SHA-256 rather than the SHA-1 an ETag conventionally uses. Nothing here depends on
 * collision resistance — a clash would serve a stale page, not forge one — but a weak hash
 * in a bank's codebase is a thing a reviewer has to stop and reason about every time they
 * meet it, and the cost of not making them is a few microseconds per response.
 */
function weakEtag(body: unknown): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('base64url')
    .slice(0, ETAG_LENGTH);

  return `W/"${digest}"`;
}
