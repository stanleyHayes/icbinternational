/**
 * The tab-scoped guest session.
 *
 * A chat survives a reload but not a new tab: the guest token lives in `sessionStorage`,
 * and everything after the first message — rehydrating the thread, sending replies,
 * listening for the agent — hangs off that token.
 */

/** Where the session is kept. sessionStorage, not localStorage: a new tab is a new guest. */
const STORAGE_KEY = 'rb-guest-chat';

/** What a guest session needs to survive a reload: the thread id and its bearer token. */
export interface StoredSession {
  readonly conversationId: string;
  readonly token: string;
  readonly expiresAt: string;
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredSession(parsed)) return null;
    // An expired token can only 401; treat it as no session at all.
    return Date.parse(parsed.expiresAt) > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A browser that refuses storage simply loses the thread on reload.
  }
}

export function clearStoredSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the token dies with the tab regardless.
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.conversationId === 'string' &&
    typeof candidate.token === 'string' &&
    typeof candidate.expiresAt === 'string'
  );
}
