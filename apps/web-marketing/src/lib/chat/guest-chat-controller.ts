/**
 * The guest chat lifecycle as a plain controller class.
 *
 * Kept out of the hook for two reasons: the logic is testable without a renderer, and a
 * React hook body carrying this many branches would never fit the function-size budget.
 * The hook subscribes and delegates; the controller decides.
 *
 * Transport mirrors the contract: messages are SENT over REST and RECEIVED over the
 * receive-only stream from `chat-stream.ts`. Every successful reconnect refetches over
 * REST, so whatever the socket missed while down arrives in the refetch rather than as a
 * duplicate — every append dedupes on message id.
 */

import { ApiClientError } from '@reliance/api-client';
import {
  ChatAuthorType,
  ChatConversationStatus,
  ErrorCode,
  type ChatConversation,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatStreamEvent,
  type GuestChatSession,
} from '@reliance/contracts';

import { chatClient } from './chat-client';
import { connectChatStream, type CreateChatSocket } from './chat-stream';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
  type StoredSession,
} from './guest-session-storage';

const START_FAILURE = 'We could not start the chat. Please try again in a moment.';
const SEND_FAILURE = 'That message did not send. Please try again.';

export type GuestChatPhase = 'idle' | 'pre-chat' | 'active';

export interface GuestChatInput {
  readonly name: string;
  readonly email: string;
  readonly body: string;
}

/** The render-ready snapshot the hook subscribes to. */
export interface GuestChatView {
  readonly phase: GuestChatPhase;
  readonly conversation: ChatConversation | null;
  readonly starting: boolean;
  readonly sending: boolean;
  readonly error: string | null;
  readonly unreadCount: number;
}

interface ControllerState {
  readonly open: boolean;
  readonly session: StoredSession | null;
  readonly conversation: ChatConversation | null;
  /** True while a stored session is being rehydrated, so the panel shows a spinner. */
  readonly resuming: boolean;
  readonly starting: boolean;
  readonly sending: boolean;
  readonly error: string | null;
  readonly unreadCount: number;
}

const INITIAL_STATE: ControllerState = {
  open: false,
  session: null,
  conversation: null,
  resuming: false,
  starting: false,
  sending: false,
  error: null,
  unreadCount: 0,
};

function phaseOf(state: ControllerState): GuestChatPhase {
  if (state.conversation || state.resuming) return 'active';
  return state.open ? 'pre-chat' : 'idle';
}

function toView(state: ControllerState): GuestChatView {
  return {
    phase: phaseOf(state),
    conversation: state.conversation,
    starting: state.starting,
    sending: state.sending,
    error: state.error,
    unreadCount: state.unreadCount,
  };
}

function sessionOf(session: GuestChatSession): StoredSession {
  return {
    conversationId: session.conversation.id,
    token: session.streamToken.token,
    expiresAt: session.streamToken.expiresAt,
  };
}

/** Appends unless the id is already there — the WS echo of a REST-sent message is one such case. */
function withMessage(conversation: ChatConversation, message: ChatMessage): ChatConversation {
  if (conversation.messages.some((existing) => existing.id === message.id)) return conversation;
  return { ...conversation, messages: [...conversation.messages, message], updatedAt: message.sentAt };
}

/** A failed send either closes the thread (409: the agent ended it) or shows an error. */
function sendFailurePatch(
  cause: unknown,
  conversation: ChatConversation,
): Partial<ControllerState> {
  if (cause instanceof ApiClientError && cause.is(ErrorCode.CONFLICT)) {
    const closedAt = conversation.closedAt ?? new Date().toISOString();
    return { conversation: { ...conversation, status: ChatConversationStatus.CLOSED, closedAt } };
  }
  return { error: SEND_FAILURE };
}

/**
 * The controller. The public surface is arrow properties so the widget can pass the
 * methods straight into props without binding.
 */
export class GuestChatController {
  private state: ControllerState = INITIAL_STATE;
  private view: GuestChatView = toView(INITIAL_STATE);
  private listener: (() => void) | null = null;
  private disconnectStream: (() => void) | null = null;
  /** Bumped on dispose/startNewChat so an in-flight rehydrate cannot resurrect state. */
  private generation = 0;

  constructor(private readonly createSocket: CreateChatSocket) {}

  readonly subscribe = (onChange: () => void): (() => void) => {
    this.listener = onChange;
    return () => {
      this.listener = null;
    };
  };

  readonly getView = (): GuestChatView => this.view;

  readonly setOpen = (open: boolean): void => {
    if (open === this.state.open) return;
    this.update({ open, unreadCount: open ? 0 : this.state.unreadCount });
    if (open && !this.state.session) void this.resumeStoredSession();
  };

  readonly startConversation = async (input: GuestChatInput): Promise<boolean> => {
    this.update({ starting: true, error: null });
    try {
      const { data } = await chatClient().chat.createGuestConversation(input);
      const session = sessionOf(data);
      writeStoredSession(session);
      this.update({ session, conversation: data.conversation, starting: false, unreadCount: 0 });
      this.connectStream(session);
      return true;
    } catch {
      this.update({ starting: false, error: START_FAILURE });
      return false;
    }
  };

  readonly sendMessage = async (body: string): Promise<boolean> => {
    const { session, conversation } = this.state;
    if (!session || !conversation || conversation.status === ChatConversationStatus.CLOSED) {
      return false;
    }
    this.update({ sending: true, error: null });
    try {
      const api = chatClient().chat;
      const { data } = await api.postGuestMessage(session.token, session.conversationId, { body });
      this.update({ sending: false, conversation: withMessage(conversation, data) });
      return true;
    } catch (cause) {
      this.update({ sending: false, ...sendFailurePatch(cause, conversation) });
      return false;
    }
  };

  readonly startNewChat = (): void => {
    this.generation += 1;
    this.disconnectStream?.();
    this.disconnectStream = null;
    clearStoredSession();
    this.update({ session: null, conversation: null, resuming: false, error: null, unreadCount: 0 });
  };

  readonly dispose = (): void => {
    this.generation += 1;
    this.disconnectStream?.();
    this.disconnectStream = null;
  };

  private update(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    this.view = toView(this.state);
    this.listener?.();
  }

  /** Pulls the whole thread over REST. Returns false when the session itself is dead. */
  private async refetch(session: StoredSession): Promise<boolean> {
    try {
      const { data } = await chatClient().chat.getGuestConversation(
        session.token,
        session.conversationId,
      );
      this.update({ conversation: data });
      return true;
    } catch (cause) {
      // A transient failure just waits for the next reconnect, which refetches again.
      return !(cause instanceof ApiClientError && cause.is(ErrorCode.UNAUTHENTICATED));
    }
  }

  private async resumeStoredSession(): Promise<void> {
    const stored = readStoredSession();
    if (!stored) return;
    const resumedAs = this.generation;
    this.update({ resuming: true });
    const alive = await this.refetch(stored);
    if (resumedAs !== this.generation) return;
    if (!alive) {
      clearStoredSession();
      this.update({ resuming: false });
      return;
    }
    this.update({ session: stored, resuming: false });
    this.connectStream(stored);
  }

  private connectStream(session: StoredSession): void {
    this.disconnectStream?.();
    this.disconnectStream = connectChatStream(
      chatClient().chat.streamUrl(session.token),
      this.createSocket,
      { onFrame: this.handleFrame, onReconnected: () => void this.refetch(session) },
    );
  }

  private readonly handleFrame = (frame: ChatStreamEvent): void => {
    if (frame.event === 'chat.message') {
      this.handleMessage(frame.data.conversationId, frame.data.message);
    }
    if (frame.event === 'chat.conversation') this.handleSummary(frame.data);
    // 'heartbeat' — deliberately ignored.
  };

  private handleMessage(conversationId: string, message: ChatMessage): void {
    const current = this.state.conversation;
    if (!current || conversationId !== current.id) return;
    // The guest's own echo is never unread, and an open panel has already been seen.
    const unseen = !this.state.open && message.authorType !== ChatAuthorType.GUEST;
    this.update({
      conversation: withMessage(current, message),
      unreadCount: unseen ? this.state.unreadCount + 1 : this.state.unreadCount,
    });
  }

  private handleSummary(summary: ChatConversationSummary): void {
    const current = this.state.conversation;
    if (!current || summary.id !== current.id) return;
    this.update({
      conversation: { ...current, status: summary.status, closedAt: summary.closedAt },
    });
  }
}
