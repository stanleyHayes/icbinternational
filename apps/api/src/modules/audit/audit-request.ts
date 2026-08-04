import { type Request } from 'express';

import { TRACE_HEADER } from '@reliance/contracts';

import { MAX_USER_AGENT_LENGTH, SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME } from './audit.constants.js';
import { AuditActorType, type AuditActor } from './audit.types.js';

/**
 * Reading the actor and the request context off an Express request.
 *
 * Split out of the interceptor because these are the only parts that know anything about
 * HTTP, and because they encode an assumption worth stating plainly: **the auth layer
 * (A-04) attaches the caller to `request.user`.** Until it does, every audited change is
 * attributed to the system actor, which is honest — "we do not know who did this" — and
 * keeps this module compiling and testable ahead of the module it depends on.
 */

/** The shape A-04 is expected to attach. Structural, so no import coupling either way. */
export interface AuditableUser {
  readonly id: string;
  readonly fullName?: string;
  readonly email?: string;
  /** Present on staff sessions. Distinguishes an ADMIN actor from a CUSTOMER one. */
  readonly isAdmin?: boolean;
}

/** An Express request as this module reads it. */
export type AuditableRequest = Request & { user?: AuditableUser };

/** The actor to attribute a change to, falling back to the system when unauthenticated. */
export function actorFrom(request: AuditableRequest): AuditActor {
  const user = request.user;
  if (!user) {
    return { type: AuditActorType.SYSTEM, id: SYSTEM_ACTOR_ID, name: SYSTEM_ACTOR_NAME };
  }

  return {
    type: user.isAdmin ? AuditActorType.ADMIN : AuditActorType.CUSTOMER,
    id: user.id,
    name: user.fullName ?? user.email ?? user.id,
  };
}

/** Trace id stamped by `TraceMiddleware`. Absent only outside the HTTP pipeline. */
export function traceIdFrom(request: AuditableRequest): string {
  const header = request.headers[TRACE_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : UNTRACED;
}

export function ipAddressFrom(request: AuditableRequest): string | null {
  return request.ip ?? null;
}

/** Truncated: a user agent is context, and some of them are absurdly long. */
export function userAgentFrom(request: AuditableRequest): string | null {
  const agent = request.headers['user-agent'];
  if (typeof agent !== 'string' || agent.length === 0) return null;
  return agent.slice(0, MAX_USER_AGENT_LENGTH);
}

/**
 * Follows a dotted path such as `params.accountId` into the request.
 *
 * Returns `null` for anything that is not a non-empty string, so a missing route
 * parameter cannot become the literal id `"undefined"` in the audit trail.
 */
export function readStringPath(source: unknown, path: string): string | null {
  let current: unknown = source;

  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return null;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' && current.length > 0 ? current : null;
}

const UNTRACED = 'untraced';
