import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/index.js';

import { AdminChatController } from './admin-chat.controller.js';
import { AdminChatService } from './admin-chat.service.js';
import { ChatStreamService } from './chat-stream.service.js';
import { ChatWsTokenService } from './chat-ws-token.service.js';
import { CHAT_MODEL } from './chat.constants.js';
import { ChatController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatRepository } from './chat.repository.js';
import { ChatConversationSchema } from './chat.schema.js';
import { ChatService } from './chat.service.js';
import { ChatStore } from './chat.store.js';
import { GuestChatGuard } from './guest-chat.guard.js';
import { PublicChatController } from './public-chat.controller.js';

/**
 * Live support chat: the real-time sibling of tickets.
 *
 * ## Where the collaborators come from, and why
 *
 * `AuthModule` supplies the customer guard chain and `UsersService` — the latter for
 * one narrow reason: a message is signed with the name the customer would recognise,
 * denormalised at the moment it is written, so this module reads a customer record on a
 * write and never on a read. `RbacModule` backs the guard chain behind
 * `@AdminEndpoint`, and `AuditModule` the `@Audited` trail on staff mutations.
 *
 * `JwtService` is provided locally, exactly as `AuthModule` provides its own: the chat
 * stream token is signed and verified here, and sharing the auth module's instance
 * would couple two lifetimes that have nothing to do with each other.
 *
 * `ChatRepository` is registered under its own class as well as under `ChatStore`: the
 * audit interceptor resolves the loader by class from the container, and `useExisting`
 * keeps both tokens pointing at one instance rather than at two connections to the same
 * collection.
 *
 * There is no `LedgerModule` here, and there should not be — a conversation about money
 * is not money. A chat is one document and every change to it is one atomic update.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: CHAT_MODEL, schema: ChatConversationSchema }]),
    AuthModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [ChatController, PublicChatController, AdminChatController],
  providers: [
    { provide: JwtService, useFactory: () => new JwtService() },

    ChatRepository,
    { provide: ChatStore, useExisting: ChatRepository },

    ChatWsTokenService,
    ChatStreamService,
    ChatService,
    AdminChatService,
    GuestChatGuard,
    ChatGateway,

    // Provided locally, as the tickets lane does, so the module stands up in a test
    // that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
  ],
  exports: [ChatStore, ChatService, AdminChatService, ChatStreamService],
})
export class ChatModule {}
