import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { type z } from 'zod';

import {
  createChatConversationRequestSchema,
  listChatConversationsQuerySchema,
  postChatMessageRequestSchema,
  routes,
  type ChatConversation,
  type ChatStreamToken,
  type CreateChatConversationRequest,
  type Paginated,
  type PostChatMessageRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { ChatWsTokenService } from './chat-ws-token.service.js';
import { CHAT_AUDIT_CAPTURE_FIELDS, CHAT_AUDIT_ENTITY } from './chat.constants.js';
import { toContractConversation } from './chat.mapper.js';
import { ChatRepository } from './chat.repository.js';
import { ChatService } from './chat.service.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

const CONVERSATION_ROUTE = routes.chat.conversation(`:${ID_PARAM}`);

/** Everything this controller writes is audited under the same entity family. */
const AUDIT = { entity: CHAT_AUDIT_ENTITY, captureFields: CHAT_AUDIT_CAPTURE_FIELDS };

type ListChatConversationsQuery = z.infer<typeof listChatConversationsQuerySchema>;

/**
 * A customer's live chat with the bank.
 *
 * `CsrfGuard` sits on the mutations only, as it does on tickets: these routes
 * authenticate from a cookie, which is exactly what a cross-site request can ride on,
 * so every state change carries the double-submit check — but a read cannot be
 * weaponised that way and requiring the header there would break the inbox rather than
 * protect it.
 *
 * No handler checks ownership. That rule lives in `ChatService`, so it holds for every
 * caller rather than for every caller who remembered.
 *
 * There is deliberately no close route. The contract does not define one for customers
 * — a chat ends when the bank ends it — and an invented route here would be a literal
 * the frozen package knows nothing about.
 */
@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly wsTokens: ChatWsTokenService,
  ) {}

  @Get(routes.chat.conversations)
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listChatConversationsQuerySchema)) query: ListChatConversationsQuery,
  ): Promise<Paginated<ChatConversation>> {
    const page = await this.chat.listConversations(user.userId, {
      limit: query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
    return { data: page.data.map(toContractConversation), page: page.page };
  }

  /** Opens a conversation. The customer's first message is the opening of the thread. */
  @Post(routes.chat.conversations)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'chat.open', subjectLoader: ChatRepository, ...AUDIT })
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createChatConversationRequestSchema)) request: CreateChatConversationRequest,
  ): Promise<ChatConversation> {
    return toContractConversation(await this.chat.createConversation(user.userId, request));
  }

  /** One conversation and its whole thread. Reading it clears the customer's badge. */
  @Get(CONVERSATION_ROUTE)
  @UseGuards(JwtAuthGuard)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) conversationId: string,
  ): Promise<ChatConversation> {
    return toContractConversation(await this.chat.getConversation(user.userId, conversationId));
  }

  /** Adds to the thread. A closed conversation answers with a conflict, not a reopen. */
  @Post(routes.chat.messages(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'chat.message', subjectLoader: ChatRepository, ...AUDIT })
  async postMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) conversationId: string,
    @Body(zodBody(postChatMessageRequestSchema)) request: PostChatMessageRequest,
  ): Promise<ChatConversation> {
    return toContractConversation(
      await this.chat.postMessage(user.userId, conversationId, request.body),
    );
  }

  /**
   * Mints the short-lived token that authorises a `routes.chat.stream` connection.
   *
   * Behind `JwtAuthGuard`, so the session-liveness and account-status checks have
   * already run: the stream token never outlives the session's right to exist, it only
   * outlives the round trip that minted it.
   */
  @Post(routes.chat.wsToken)
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async mintStreamToken(@CurrentUser() user: AuthenticatedUser): Promise<ChatStreamToken> {
    return this.wsTokens.mintForCustomer({ userId: user.userId, sessionId: user.sessionId });
  }
}
