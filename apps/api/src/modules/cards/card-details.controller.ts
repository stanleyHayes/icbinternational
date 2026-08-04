import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  routes,
  setCardPinRequestSchema,
  type Card,
  type CardControls,
  type CardSensitiveDetails,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';
import { StepUp } from '../mfa/step-up.decorator.js';

import { toContractCard } from './card.mapper.js';
import { CardService } from './card.service.js';
import { setCardControlsRequestSchema } from './cards.dto.js';
import { CardControlsService } from './controls/card-controls.service.js';
import { CardSensitiveService } from './issuing/card-sensitive.service.js';
import { CardPinService } from './lifecycle/card-pin.service.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'card';

/**
 * Everything about a card that a stolen session must not be enough to reach.
 *
 * The card number, the security code and the PIN are the card. Somebody who has taken
 * over a session can already see a balance and a statement; what they must not be able to
 * do is walk away with a working card number or set a PIN they know. So all three routes
 * sit behind `@StepUp()`, which demands a re-authentication minted in the last few
 * minutes and matched to this user.
 *
 * The controls route is here for the same reason one step removed. Turning international
 * payments on and raising a daily limit is what an attacker does *before* using the card
 * they just revealed, and a control change that needed no more proof than the session
 * would make the reveal's protection theatre.
 *
 * `@StepUp()` is declared after `JwtAuthGuard` on the class, which is the order the guard
 * requires: it matches the proof against the authenticated user and cannot do that if
 * nothing has authenticated one.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CardDetailsController {
  constructor(
    private readonly cards: CardService,
    private readonly controls: CardControlsService,
    private readonly sensitive: CardSensitiveService,
    private readonly pins: CardPinService,
  ) {}

  /**
   * The full card number, security code and expiry.
   *
   * A `POST`, not a `GET`, and deliberately so: the response must never be cached by a
   * browser, a proxy or a service worker, and a GET is cacheable by default in all three.
   * The payload carries its own `validUntil` and the client blanks the panel against it.
   */
  @Post(routes.cards.sensitive(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @StepUp()
  @Audited({ action: 'card.details.reveal', entity: AUDIT_ENTITY })
  async reveal(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
  ): Promise<CardSensitiveDetails> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    return this.sensitive.reveal(card);
  }

  /**
   * Sets or changes the card's PIN.
   *
   * Also the documented way out of a lockout, which is why it clears the attempt counter:
   * a customer who has forgotten their PIN needs a route that is not "wait an hour", and
   * they have just proved who they are to get here.
   */
  @Put(routes.cards.pin(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @StepUp()
  @Idempotent()
  @Audited({ action: 'card.pin.set', entity: AUDIT_ENTITY })
  async setPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
    @Body(zodBody(setCardPinRequestSchema)) body: { pin: string },
  ): Promise<Card> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    return toContractCard(await this.pins.set({ card, pin: body.pin }));
  }

  @Get(routes.cards.controls(`:${ID_PARAM}`))
  async getControls(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
  ): Promise<CardControls> {
    return this.controls.get(user.userId, cardId);
  }

  /**
   * Replaces the card's switches and ceilings wholesale.
   *
   * A `PUT` of the whole object rather than a patch, because the client already holds it
   * and a partial body cannot distinguish "the customer turned contactless off" from "the
   * field was omitted" — and getting that wrong leaves a control the customer believes is
   * set and the network ignores.
   */
  @Put(routes.cards.controls(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @StepUp()
  @Idempotent()
  @Audited({ action: 'card.controls.replace', entity: AUDIT_ENTITY })
  async setControls(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
    @Body(zodBody(setCardControlsRequestSchema)) controls: CardControls,
  ): Promise<Card> {
    const updated = await this.controls.replace({ userId: user.userId, cardId, controls });
    return toContractCard(updated);
  }
}
