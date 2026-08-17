/**
 * The WebSocket end of live chat.
 *
 * Receive-only by construction: the socket is registered with the stream service and
 * never read from. Everything a participant or agent wants to say goes over REST —
 * enveloped, CSRF-checked, Zod-validated, audited — and everything the bank wants them
 * to hear arrives here.
 *
 * Admission is three checks, all failed closed: the `?token=` credential verifies
 * through `ChatWsTokenService` (signature, expiry, `typ: 'chat'`), a present `Origin`
 * header matches the CORS allow-list (a browser will send it; a non-browser client
 * sends none and is not impersonating a web origin), and the verified scope is under
 * its connection cap. Any failure closes the socket before a single frame is sent.
 */

import { type IncomingMessage } from 'node:http';

import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { type WebSocket } from 'ws';

import { API_PREFIX, routes } from '@reliance/contracts';

import { AppConfigService } from '../../config/config.service.js';

import { ChatStreamService } from './chat-stream.service.js';
import { ChatWsTokenService } from './chat-ws-token.service.js';

/** Policy violation: the standard close code for "you may not listen here". */
const CLOSE_POLICY_VIOLATION = 1008;

@WebSocketGateway({ path: `${API_PREFIX}${routes.chat.stream}` })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly tokens: ChatWsTokenService,
    private readonly stream: ChatStreamService,
    private readonly config: AppConfigService,
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      const token = tokenFrom(request);
      if (!token) throw new Error('Missing stream token');

      const scope = await this.tokens.verify(token);
      this.assertOriginAllowed(request);
      this.stream.register(client, scope);
    } catch (error) {
      this.logger.debug(`Stream connection refused: ${(error as Error).message}`);
      client.close(CLOSE_POLICY_VIOLATION, 'Connection refused');
    }
  }

  handleDisconnect(client: WebSocket): void {
    this.stream.unregister(client);
  }

  /**
   * A cross-origin browser socket is CSRF's ambient cousin: it rides no cookie, but it
   * would let any page a customer has open listen on their chat if the token ever
   * leaked into a URL somebody else can read. An absent Origin is a non-browser client,
   * which has no origin to confuse.
   */
  private assertOriginAllowed(request: IncomingMessage): void {
    const origin = request.headers.origin;
    if (origin !== undefined && !this.config.allowedOrigins.includes(origin)) {
      throw new Error(`Origin ${origin} is not allowed`);
    }
  }
}

/** The `?token=` query parameter off the upgrade request's URL. */
function tokenFrom(request: IncomingMessage): string | null {
  // The base is a parsing aid only — `req.url` is always an origin-form path here.
  return new URL(request.url ?? '/', 'http://localhost').searchParams.get('token');
}
