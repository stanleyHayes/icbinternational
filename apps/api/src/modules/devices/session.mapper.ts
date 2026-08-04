import { type Session as SessionView } from '@reliance/contracts';

import { type SessionDocument } from '../auth/schemas/session.schema.js';

import { describeUserAgent } from './user-agent.js';

/**
 * Projects a session row onto the contract view for the "your active sessions" screen.
 *
 * `location` is null until geo-IP lands with the fraud workstream — the field exists in
 * the contract so the UI can render it the day it does. The refresh token hash and the
 * family chain stay in the document; they are forensic material, not display material.
 */
export function toSessionView(session: SessionDocument, currentSessionId: string): SessionView {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    deviceLabel: describeUserAgent(session.userAgent).label,
    ipAddress: session.ip,
    location: null,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}
