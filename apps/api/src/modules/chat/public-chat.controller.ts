import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  createGuestChatRequestSchema,
  postChatMessageRequestSchema,
  routes,
  type ChatConversation,
  type CreateGuestChatRequest,
  type GuestChatSession,
  type PostChatMessageRequest,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { ChatWsTokenService } from './chat-ws-token.service.js';
import { toContractConversation } from './chat.mapper.js';
import { ChatService } from './chat.service.js';
import { GuestChat, GuestChatGuard, type GuestChatScope } from './guest-chat.guard.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/**
 * Live chat for visitors of the marketing site — no account, no session, no cookie.
 *
 * The opening POST is unauthenticated by definition: it is how the credential comes
 * into being. Everything after it carries the guest stream token as a bearer token, and
 * the guard scopes the request to the one conversation that token was minted with.
 * Asking for a different conversation answers 404, indistinguishable from one that
 * does not exist — a 403 would confirm somebody else's chat is real.
 */
@Controller()
export class PublicChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly wsTokens: ChatWsTokenService,
  ) {}

  /** Starts a guest conversation. The reply carries the token that continues it. */
  @Post(routes.public.chat.conversations)
  @HttpCode(HttpStatus.CREATED)
  async open(
    @Body(zodBody(createGuestChatRequestSchema)) request: CreateGuestChatRequest,
  ): Promise<GuestChatSession> {
    const conversation = await this.chat.createGuestConversation(request);
    return {
      conversation: toContractConversation(conversation),
      streamToken: await this.wsTokens.mintForGuest(conversation.id),
    };
  }

  /** The guest's own thread. Opening it clears their unread badge. */
  @Get(routes.public.chat.conversation(`:${ID_PARAM}`))
  @UseGuards(GuestChatGuard)
  async get(
    @GuestChat() guest: GuestChatScope,
    @Param(ID_PARAM) conversationId: string,
  ): Promise<ChatConversation> {
    const scoped = requireOwn(guest, conversationId);
    return toContractConversation(await this.chat.getGuestConversation(scoped));
  }

  /** The guest adds to their thread. A closed conversation answers with a conflict. */
  @Post(routes.public.chat.messages(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GuestChatGuard)
  async postMessage(
    @GuestChat() guest: GuestChatScope,
    @Param(ID_PARAM) conversationId: string,
    @Body(zodBody(postChatMessageRequestSchema)) request: PostChatMessageRequest,
  ): Promise<ChatConversation> {
    const scoped = requireOwn(guest, conversationId);
    return toContractConversation(await this.chat.postGuestMessage(scoped, request.body));
  }
}

/**
 * The conversation the token names, or 404.
 *
 * The comparison is against the verified claim, never against anything in the request
 * body, so the answer cannot be influenced by what the caller asks for.
 */
function requireOwn(guest: GuestChatScope, conversationId: string): string {
  if (guest.conversationId !== conversationId) {
    throw AppError.notFound('Chat conversation', conversationId);
  }
  return guest.conversationId;
}
