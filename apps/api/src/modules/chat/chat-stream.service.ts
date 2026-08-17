/**
 * The live chat stream: one WebSocket registry, in-process.
 *
 * Messages are SENT over REST and RECEIVED here — the socket never accepts writes, so a
 * hijacked connection can read what its token already entitles it to and nothing more.
 * Fan-out is by scope, verified from the token at connect time: a customer scope hears
 * that customer's conversations, a guest scope hears exactly one conversation, and an
 * agent scope hears every conversation, because the inbox is a live list rather than a
 * per-thread subscription.
 *
 * A heartbeat goes down every idle connection, because an intermediary that sees no
 * bytes for a minute will close it and the participant will silently stop receiving
 * anything.
 *
 * This is in-process state. With more than one API instance a participant connected to
 * instance A will not see a message published on instance B, so a Redis pub/sub fan-out
 * belongs behind this same interface before the API is scaled horizontally — the same
 * caveat the notification stream carries, noted rather than pretended away.
 */

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import {
  type ChatConversationSummary,
  type ChatMessage,
  type ChatStreamEvent,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { type ChatStreamScope } from './chat-ws-token.service.js';
import { CHAT_STREAM_HEARTBEAT_MS, MAX_CHAT_CONNECTIONS_PER_PRINCIPAL } from './chat.constants.js';
import { type ChatConversationRecord } from './chat.store.js';

/** `ws`'s open state, named so a magic number never appears at the send site. */
const READY_STATE_OPEN = 1;

/**
 * The slice of a `ws` socket this service uses.
 *
 * Structural rather than imported so the registry — and every test of it — needs no
 * socket library: anything that can accept a string frame qualifies.
 */
export interface ChatSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

@Injectable()
export class ChatStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatStreamService.name);
  private readonly connections = new Map<ChatSocket, ChatStreamScope>();
  private readonly connectionCounts = new Map<string, number>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(private readonly clock: ClockService) {
    // `unref` so a test process — or a shutdown that forgot its hooks — is never kept
    // alive by a timer whose only job is to keep somebody else's connection alive.
    this.heartbeatTimer = setInterval(() => this.heartbeat(), CHAT_STREAM_HEARTBEAT_MS);
    this.heartbeatTimer.unref();
  }

  /**
   * Adds a socket under a verified scope.
   *
   * Capped per principal: a page with a leaking effect can otherwise open a connection
   * on every render and exhaust the server's sockets one browser tab at a time.
   *
   * @throws {AppError} `FORBIDDEN` when the principal is already at the cap.
   */
  register(socket: ChatSocket, scope: ChatStreamScope): void {
    const key = principalKey(scope);
    if ((this.connectionCounts.get(key) ?? 0) >= MAX_CHAT_CONNECTIONS_PER_PRINCIPAL) {
      throw AppError.forbidden(
        'You have too many live connections open. Close a tab and try again.',
      );
    }

    this.connections.set(socket, scope);
    this.connectionCounts.set(key, (this.connectionCounts.get(key) ?? 0) + 1);
  }

  /** Drops a socket however the connection ended — a closed tab, a drop, a shutdown. */
  unregister(socket: ChatSocket): void {
    const scope = this.connections.get(socket);
    if (!scope) return;

    this.connections.delete(socket);

    const key = principalKey(scope);
    const remaining = (this.connectionCounts.get(key) ?? 1) - 1;
    if (remaining <= 0) {
      this.connectionCounts.delete(key);
      return;
    }
    this.connectionCounts.set(key, remaining);
    this.logger.debug(`${remaining} live connection(s) remain for ${key}`);
  }

  /**
   * A new message: to the conversation's participant, and to every agent.
   *
   * Agents hear everything because the inbox is a live list — an agent watching the
   * queue needs the badge to move whether or not they have the thread open.
   */
  publishMessage(conversation: ChatConversationRecord, message: ChatMessage): void {
    const event: ChatStreamEvent = {
      event: 'chat.message',
      data: { conversationId: conversation.id, message },
    };

    this.broadcast(event, (scope) => scope.kind === 'agent' || isParticipant(scope, conversation));
  }

  /**
   * A conversation's list shape changed: to every agent, and to its participant.
   *
   * Carries the summary rather than the thread — enough for an inbox row or a badge to
   * re-render without the client refetching, and never more than the stream's audience
   * is entitled to.
   */
  publishConversation(record: ChatConversationRecord, summary: ChatConversationSummary): void {
    this.broadcast({ event: 'chat.conversation', data: summary }, (scope) => {
      if (scope.kind === 'agent') return true;
      return isParticipant(scope, record);
    });
  }

  /** How many sockets are live, for the health surface and for tests. */
  get connectionCount(): number {
    return this.connections.size;
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeatTimer);
    for (const socket of this.connections.keys()) socket.close();
    this.connections.clear();
    this.connectionCounts.clear();
  }

  private heartbeat(): void {
    this.broadcast(
      { event: 'heartbeat', data: { at: this.clock.now().toISOString() } },
      () => true,
    );
  }

  private broadcast(event: ChatStreamEvent, hears: (scope: ChatStreamScope) => boolean): void {
    const frame = JSON.stringify(event);
    for (const [socket, scope] of this.connections) {
      if (!hears(scope) || socket.readyState !== READY_STATE_OPEN) continue;
      try {
        socket.send(frame);
      } catch (error) {
        // A socket that cannot accept a frame is a dead connection the close event has
        // not caught up with yet. It unregisters there; dropping it here would only
        // make one failure look like two.
        this.logger.debug(`Frame send failed for ${principalKey(scope)}`, error);
      }
    }
  }
}

/** The cap's unit: one customer, one agent, or one guest conversation. */
function principalKey(scope: ChatStreamScope): string {
  switch (scope.kind) {
    case 'customer':
      return `customer:${scope.userId}`;
    case 'agent':
      return `agent:${scope.adminId}`;
    case 'guest':
      return `guest:${scope.conversationId}`;
  }
}

/** True when the scope belongs to the person this conversation is with. */
function isParticipant(scope: ChatStreamScope, conversation: ChatConversationRecord): boolean {
  if (scope.kind === 'customer') {
    return conversation.customerUserId !== null && scope.userId === conversation.customerUserId;
  }
  if (scope.kind === 'guest') return scope.conversationId === conversation.id;
  return false;
}
