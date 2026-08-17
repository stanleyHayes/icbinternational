/**
 * The support inbox, for staff.
 *
 * Permissioned on `ticket:manage` — the chat inbox is worked by the same support team
 * that works the ticket queue, and a separate permission would split one job into two
 * roles nobody holds independently.
 *
 * The mutations are `@Audited()` and that is load-bearing, for the same reason the
 * ticket reply is: a chat message is the bank's words to a customer, and the first
 * question asked when a complaint escalates is who said them. None of them is
 * `@Idempotent()`: that decorator requires an `Idempotency-Key` header the finished
 * console does not send, and a replayed message here is a visible, deletable duplicate
 * rather than a payment made twice.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { type z } from 'zod';

import {
  listChatConversationsQuerySchema,
  Permission,
  postChatMessageRequestSchema,
  routes,
  type AdminChatConversation,
  type ChatConversationSummary,
  type ChatStreamToken,
  type Paginated,
  type PostChatMessageRequest,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { AdminEndpoint, CurrentAdmin, type AdminPrincipal } from '../rbac/index.js';

import { AdminChatService } from './admin-chat.service.js';
import { ChatWsTokenService } from './chat-ws-token.service.js';
import { CHAT_AUDIT_CAPTURE_FIELDS, CHAT_AUDIT_ENTITY } from './chat.constants.js';
import { toAdminConversation, toConversationSummary } from './chat.mapper.js';
import { ChatRepository } from './chat.repository.js';

const ID_PARAM = 'id';

const CONVERSATION_ROUTE = routes.admin.chat.conversation(`:${ID_PARAM}`);

const AUDIT = { entity: CHAT_AUDIT_ENTITY, captureFields: CHAT_AUDIT_CAPTURE_FIELDS };

type ListChatConversationsQuery = z.infer<typeof listChatConversationsQuerySchema>;

@Controller()
@AdminEndpoint(Permission.TICKET_MANAGE)
export class AdminChatController {
  constructor(
    private readonly chat: AdminChatService,
    private readonly wsTokens: ChatWsTokenService,
  ) {}

  /** Every conversation, most recently active first. */
  @Get(routes.admin.chat.conversations)
  async inbox(
    @Query(zodBody(listChatConversationsQuerySchema)) query: ListChatConversationsQuery,
  ): Promise<Paginated<ChatConversationSummary>> {
    const page = await this.chat.listConversations({
      limit: query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
    return { data: page.data.map(toConversationSummary), page: page.page };
  }

  /** One conversation and its whole thread. Opening it clears the agent-side badge. */
  @Get(CONVERSATION_ROUTE)
  async get(@Param(ID_PARAM) conversationId: string): Promise<AdminChatConversation> {
    return toAdminConversation(await this.chat.getConversation(conversationId));
  }

  /** Replies to the customer or guest, signed with the agent's session name. */
  @Post(routes.admin.chat.messages(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.CREATED)
  @Audited({ action: 'chat.message', subjectLoader: ChatRepository, ...AUDIT })
  async postMessage(
    @CurrentAdmin() agent: AdminPrincipal | undefined,
    @Param(ID_PARAM) conversationId: string,
    @Body(zodBody(postChatMessageRequestSchema)) request: PostChatMessageRequest,
  ): Promise<AdminChatConversation> {
    if (!agent) throw AppError.forbidden('This action needs a signed-in operator.');

    return toAdminConversation(
      await this.chat.postAgentMessage(agent, conversationId, request.body),
    );
  }

  /**
   * Ends the conversation from the bank's side.
   *
   * The closing line on the record is signed SYSTEM — the words are the bank's standing
   * sentence, not something the agent wrote.
   */
  @Post(routes.admin.chat.close(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'chat.close', subjectLoader: ChatRepository, ...AUDIT })
  async close(@Param(ID_PARAM) conversationId: string): Promise<AdminChatConversation> {
    return toAdminConversation(await this.chat.closeConversation(conversationId));
  }

  /** Mints the short-lived token that authorises an agent's stream connection. */
  @Post(routes.admin.chat.wsToken)
  @HttpCode(HttpStatus.OK)
  async mintStreamToken(
    @CurrentAdmin() agent: AdminPrincipal | undefined,
  ): Promise<ChatStreamToken> {
    if (!agent) throw AppError.forbidden('This action needs a signed-in operator.');

    return this.wsTokens.mintForAgent(agent.id);
  }
}
