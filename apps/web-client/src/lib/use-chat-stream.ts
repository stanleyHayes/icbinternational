'use client';

/**
 * The live support chat stream.
 *
 * The socket is receive-only (messages go out over REST), so this hook owns the whole
 * lifecycle: minting the short-lived token, connecting, validating frames against the
 * contract, and reconnecting with exponential backoff when the connection drops. Whoever
 * owns the socket owns reconnection — that is why the API client hands back a URL rather
 * than an open connection.
 *
 * Two rules keep the stream honest:
 *
 * - A frame that does not conform to `chatStreamEventSchema` is dropped, not delivered.
 *   The socket is a network boundary, and the contract is the only shape we trust.
 * - After every *re*connect the chat queries are invalidated. Frames that arrived while
 *   the socket was down are gone for good, and a refetch is the only way to close the gap.
 *
 * The socket factory is injectable so a test can drive the hook with a fake socket and
 * never open a real connection.
 */

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { createApiClient, noCookieReader } from '@reliance/api-client';
import { chatStreamEventSchema, type ChatStreamEvent } from '@reliance/contracts';

import { browserApi } from './api';
import { API_ORIGIN } from './env';
import { queryKeys } from './query-keys';

/**
 * The stream address is built against the API origin directly, not the BFF: the session
 * cookie authorises the token mint over the same-origin proxy, but a WebSocket cannot pass
 * through a Next route handler, so the socket itself goes straight to the platform. The
 * token — not the cookie — is what authorises it.
 */
const streamClient = createApiClient({ baseUrl: API_ORIGIN, cookieReader: noCookieReader });

const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** Where the connection is: dialling, up, or waiting out a backoff before redialling. */
export type ChatStreamState = 'connecting' | 'live' | 'offline';

/**
 * The slice of `WebSocket` the stream uses, declared structurally so a test double
 * satisfies it without pretending to be a real socket.
 */
export interface ChatStreamSocket {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(): void;
}

/** Builds one socket. Defaults to `new WebSocket(url)`; injected in tests. */
export type ChatSocketFactory = (url: string) => ChatStreamSocket;

/** Props for {@link useChatStream}. */
export interface UseChatStreamOptions {
  /** False parks the hook — no token is minted and no socket opened. */
  readonly enabled?: boolean;
  /** Receives every well-formed, non-heartbeat frame. */
  readonly onEvent?: (event: ChatStreamEvent) => void;
  readonly createSocket?: ChatSocketFactory;
}

/** What the connection loop needs from the hook: dependencies and the state setter. */
interface StreamDeps {
  readonly queryClient: QueryClient;
  readonly createSocket: ChatSocketFactory;
  readonly onEvent: RefObject<UseChatStreamOptions['onEvent']>;
  readonly setState: (state: ChatStreamState) => void;
}

function defaultCreateSocket(url: string): ChatStreamSocket {
  return new WebSocket(url);
}

/** Parses and validates one raw frame. `null` means "not ours — drop it". */
function parseFrame(raw: unknown): ChatStreamEvent | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = chatStreamEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The ws URL for a fresh token, or `null` when even the mint failed. */
async function mintStreamUrl(): Promise<string | null> {
  try {
    const api = browserApi();
    const { data: token } = await api.chat.wsToken();
    return streamClient.chat.streamUrl(token.token);
  } catch {
    return null;
  }
}

/** One run of the connection loop, from the effect that starts it to the cleanup that stops it. */
class StreamConnection {
  private cancelled = false;
  private socket: ChatStreamSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  /** True once a connection has been up: the next `open` is a *re*connect. */
  private wasLive = false;

  constructor(private readonly deps: StreamDeps) {}

  start(): void {
    void this.dial();
  }

  stop(): void {
    this.cancelled = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.socket?.close();
  }

  private scheduleReconnect(): void {
    if (this.cancelled) return;
    this.deps.setState('offline');
    const delay = Math.min(INITIAL_DELAY_MS * 2 ** this.attempt, MAX_DELAY_MS);
    this.attempt += 1;
    this.timer = setTimeout(() => void this.dial(), delay);
  }

  private handleOpen(): void {
    this.attempt = 0;
    this.deps.setState('live');
    // A reconnect may have missed frames while the socket was down; refetch to close the gap.
    if (this.wasLive) {
      void this.deps.queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    }
    this.wasLive = true;
  }

  private handleMessage(raw: unknown): void {
    const frame = parseFrame(raw);
    // Heartbeats keep the connection warm; they are not events.
    if (frame === null || frame.event === 'heartbeat') return;
    this.deps.onEvent.current?.(frame);
  }

  /** One connection attempt: mint, dial, wire the handlers. */
  private async dial(): Promise<void> {
    this.deps.setState('connecting');
    const url = await mintStreamUrl();
    if (this.cancelled) return;
    if (url === null) {
      this.scheduleReconnect();
      return;
    }

    const ws = this.deps.createSocket(url);
    this.socket = ws;
    ws.onopen = () => {
      if (!this.cancelled && this.socket === ws) this.handleOpen();
    };
    ws.onmessage = (event) => this.handleMessage(event.data);
    // The error event carries nothing the close event will not; `onclose` is the one
    // reconnect path.
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (!this.cancelled && this.socket === ws) this.scheduleReconnect();
    };
  }
}

/**
 * Connects to the chat stream and keeps it connected.
 *
 * @returns the connection state, for the small print in the panel header.
 */
export function useChatStream(options: UseChatStreamOptions = {}): ChatStreamState {
  const { enabled = true, onEvent, createSocket = defaultCreateSocket } = options;
  const [state, setState] = useState<ChatStreamState>('connecting');
  const queryClient = useQueryClient();

  // The handler changes identity on every render of the widget; the connection must not.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return undefined;
    const connection = new StreamConnection({
      queryClient,
      createSocket,
      onEvent: onEventRef,
      setState,
    });
    connection.start();
    return () => connection.stop();
  }, [enabled, createSocket, queryClient]);

  return enabled ? state : 'offline';
}
