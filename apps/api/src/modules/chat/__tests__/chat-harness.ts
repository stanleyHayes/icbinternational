import { JwtService } from '@nestjs/jwt';


import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type AppConfigService } from '../../../config/config.service.js';
import { type UsersService } from '../../auth/users/index.js';
import { type AdminPrincipal } from '../../rbac/index.js';
import { AdminChatService } from '../admin-chat.service.js';
import { type ChatSocket, ChatStreamService } from '../chat-stream.service.js';
import { type ChatStreamScope, ChatWsTokenService } from '../chat-ws-token.service.js';
import { ChatService } from '../chat.service.js';
import { InMemoryChatStore } from '../in-memory-chat.store.js';

export const CUSTOMER = 'usr_01JQ8Z0000000000000000000A';
export const STRANGER = 'usr_01JQ8Z0000000000000000000B';
export const CUSTOMER_NAME = 'Ada Whitfield';
export const AGENT_NAME = 'Priya Raman';
export const AGENT_ID = 'adm_01JQ8Z0000000000000000000C';

export const GUEST_NAME = 'Owen Tate';
export const GUEST_EMAIL = 'owen.tate@example.com';

const TEST_NOW = new Date('2026-03-01T09:00:00.000Z');

/** The secret the token service is tested against. Never a real one. */
export const TEST_JWT_SECRET = 'chat-stream-test-secret';

/**
 * A recording socket.
 *
 * The stream service is tested against the frames it would have sent, not against a
 * networking library: the interesting property is who hears what, and that is
 * observable at this seam.
 */
export class FakeSocket implements ChatSocket {
  readyState = 1;
  readonly frames: string[] = [];
  closed = false;

  send(data: string): void {
    this.frames.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  /** Every frame received, parsed. */
  events(): Array<{ event: string; data: unknown }> {
    return this.frames.map((frame) => JSON.parse(frame) as { event: string; data: unknown });
  }
}

/**
 * The chat lane wired end to end over the in-memory store.
 *
 * Everything above the store is real — the lifecycle rules, the ownership check, the
 * unread arithmetic, the token signing and the fan-out. Only persistence and the
 * customer directory are doubled, and the store double enforces the same two rules the
 * repository does: a change and its message land together, and a read receipt leaves
 * `updatedAt` alone.
 */
export interface ChatRig {
  store: InMemoryChatStore;
  clock: ClockService;
  stream: ChatStreamService;
  tokens: ChatWsTokenService;
  chat: ChatService;
  adminChat: AdminChatService;
}

export function chatRig(): ChatRig {
  const clock = new ClockService();
  clock.freezeAt(TEST_NOW);

  const ids = new IdGenerator();
  const store = new InMemoryChatStore(ids);
  const stream = new ChatStreamService(clock);
  const tokens = new ChatWsTokenService(new JwtService(), fakeConfig(), clock);
  const chat = new ChatService(store, fakeUsers(), stream, clock, ids);
  const adminChat = new AdminChatService(store, stream, clock, ids);

  return { store, clock, stream, tokens, chat, adminChat };
}

/** The agent principal, as `AdminAuthGuard` would have resolved it. */
export function agentPrincipal(): AdminPrincipal {
  return {
    id: AGENT_ID,
    email: 'priya.raman@reliancebank.example',
    fullName: AGENT_NAME,
    roles: [],
    permissions: [],
    active: true,
    ipAllowlist: [],
  };
}

/** Registers a fake socket under the given scope. */
export function connect(rig: ChatRig, scope: ChatStreamScope): FakeSocket {
  const socket = new FakeSocket();
  rig.stream.register(socket, scope);
  return socket;
}

function fakeConfig(): AppConfigService {
  return {
    jwt: { accessSecret: TEST_JWT_SECRET },
    allowedOrigins: ['https://app.reliancebank.example'],
  } as unknown as AppConfigService;
}

function fakeUsers(): UsersService {
  const [firstName, lastName] = CUSTOMER_NAME.split(' ');
  return { requireById: async () => ({ firstName, lastName }) } as unknown as UsersService;
}
