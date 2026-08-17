/**
 * The receive-only chat stream: the socket contract, frame parsing and the reconnect loop.
 *
 * The socket factory is injectable because MSW cannot hold a WebSocket: tests drive the
 * widget with a fake, and the default is the real `WebSocket`. Reconnection lives here
 * rather than in the hook so the backoff arithmetic is testable without a renderer.
 */

import { chatStreamEventSchema, type ChatStreamEvent } from '@reliance/contracts';

/** Reconnect backoff: 1s, 2s, 4s… capped here. */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * The slice of `WebSocket` the stream actually uses. Handler properties rather than
 * `addEventListener` so a test double is a plain object, not an event target; the handler
 * signatures take the DOM event shapes so a real `WebSocket` satisfies this unchanged.
 */
export interface ChatSocket {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(): void;
}

export type CreateChatSocket = (url: string) => ChatSocket;

/** Callbacks the stream loop reports to its owner. */
export interface ChatStreamEvents {
  /** A contract-conforming frame; anything else has already been dropped. */
  readonly onFrame: (frame: ChatStreamEvent) => void;
  /** The socket reopened after a drop — the caller refetches over REST to close the gap. */
  readonly onReconnected: () => void;
}

/**
 * The default socket. `streamUrl` returns a relative path when no API origin is configured,
 * and the `WebSocket` constructor insists on an absolute URL, so same-origin deployments are
 * resolved against the page.
 */
export function defaultCreateSocket(url: string): ChatSocket {
  const resolved = url.startsWith('ws')
    ? url
    : new URL(url, window.location.href).toString().replace(/^http/, 'ws');
  return new WebSocket(resolved);
}

/**
 * A frame that does not match the contract is dropped, not surfaced: a noisy socket should
 * not be able to paint anything onto a banking page.
 */
export function parseStreamFrame(raw: unknown): ChatStreamEvent | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = chatStreamEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Connects, and reconnects with exponential backoff after every drop. Returns the teardown,
 * which closes the socket and cancels any pending reconnect — the caller's `dispose` path.
 */
export function connectChatStream(
  url: string,
  createSocket: CreateChatSocket,
  events: ChatStreamEvents,
): () => void {
  let attempts = 0;
  let stopped = false;
  let socket: ChatSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (stopped) return;
    attempts += 1;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
    timer = setTimeout(connect, delay);
  };

  function connect() {
    if (stopped) return;
    socket = createSocket(url);
    socket.onopen = () => {
      // A reconnect, not the first connect: the socket may have missed frames while down.
      if (attempts > 0) events.onReconnected();
      attempts = 0;
    };
    socket.onmessage = (event) => {
      const frame = parseStreamFrame(event.data);
      if (frame) events.onFrame(frame);
    };
    socket.onerror = () => {
      // onclose always follows, and that is where the reconnect is scheduled.
    };
    socket.onclose = scheduleReconnect;
  }

  connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
