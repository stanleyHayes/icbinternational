/**
 * The live channel, and what happens when there isn't one.
 *
 * The platform pushes events over a server-sent stream. Corporate proxies terminate long
 * connections, and the connection also dies whenever the operator's laptop sleeps, so a
 * feed that only knows how to stream is a feed that silently stops. This reports which
 * transport is actually in use, and the caller polls whenever it is not streaming — a
 * screen that has quietly stopped updating is worse than one that never claimed to.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { API_BASE_PATH } from '@/lib/env';

/** How the screen is currently being kept up to date. */
export type FeedTransport = 'stream' | 'polling';

/** The platform's event stream, behind this console's own proxy. */
const STREAM_URL = `${API_BASE_PATH}/v1/notifications/stream`;

/** How long to wait before trying the stream again after it drops. */
const RETRY_DELAY_MS = 30_000;

/**
 * Opens the event stream and reports whether it is carrying anything.
 *
 * @param onEvent Called for every event the platform pushes. Must be referentially
 * stable — wrap it in `useCallback`, or the stream reconnects on every render.
 */
export function useEventStream(onEvent: () => void): FeedTransport {
  const [transport, setTransport] = useState<FeedTransport>('polling');
  const [attempt, setAttempt] = useState(0);

  // Named and hoisted rather than written inline in the `setTimeout`. Inline, the state
  // updater sits four callbacks deep — effect, listener, timer, updater — which is past
  // the point where the reader can still see which scope owns what.
  const scheduleReconnect = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(STREAM_URL, { withCredentials: true });
    let retry: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener('open', () => setTransport('stream'));
    source.addEventListener('message', () => onEvent());
    source.addEventListener('error', () => {
      // EventSource retries by itself, but it does so forever and without telling anyone.
      // Closing and rescheduling keeps the transport honest on screen in the meantime.
      source.close();
      setTransport('polling');
      retry = setTimeout(scheduleReconnect, RETRY_DELAY_MS);
    });

    return () => {
      if (retry) clearTimeout(retry);
      source.close();
    };
  }, [onEvent, attempt, scheduleReconnect]);

  return transport;
}
