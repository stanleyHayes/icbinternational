/**
 * Card handlers.
 *
 * `sensitive` refuses without an `x-step-up-token` header. The real endpoint does, and a
 * mock that handed out a PAN to anyone who asked would let a lane ship the reveal screen
 * with no re-authentication step in front of it.
 */

import {
  CardStatus,
  ErrorCode,
  NotificationCategory,
  NotificationSeverity,
  routes,
  STEP_UP_HEADER,
  type Card,
  type CardControls,
} from '@reliance/contracts';

import { notify } from '../db/ledger.js';
import { makeCard, makeCardControls } from '../factories/products.js';
import { faker, mockId } from '../faker.js';

import {
  failure,
  MockMethod,
  raw,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

const SENSITIVE_VALIDITY_MINUTES = 1;
const PAN_GROUPS = 4;

/** Cards and authorisations. */
export const cardHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.cards.authorisations, ({ db, query }) => {
    const cardId = query.get('cardId');
    const status = query.get('status');
    return paginate(
      db.authorisations.filter(
        (authorisation) =>
          (!cardId || authorisation.cardId === cardId) &&
          (!status || authorisation.status === status),
      ),
      query,
    );
  }),

  route(MockMethod.GET, routes.cards.list, ({ db, query }) => {
    const accountId = query.get('accountId');
    const status = query.get('status');
    return paginate(
      db.cards.filter(
        (card) =>
          (!accountId || card.accountId === accountId) && (!status || card.status === status),
      ),
      query,
    );
  }),

  route(MockMethod.POST, routes.cards.create, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const accountId = typeof input.accountId === 'string' ? input.accountId : '';
    if (!db.accounts.some((account) => account.id === accountId)) {
      return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');
    }

    const isVirtual = input.format === 'VIRTUAL';
    const card = makeCard({
      clock: db.clock,
      accountId,
      cardholderName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
      overrides: {
        id: mockId('crd'),
        format: isVirtual ? 'VIRTUAL' : 'PHYSICAL',
        tier: (input.tier as Card['tier']) ?? 'STANDARD',
        nickname: typeof input.nickname === 'string' ? input.nickname : null,
        // Virtual cards work immediately; a physical card is posted and starts inactive.
        status: isVirtual ? CardStatus.ACTIVE : CardStatus.ORDERED,
        pinSet: isVirtual,
        isDefault: false,
        orderedAt: db.clock.nowIso(),
        activatedAt: isVirtual ? db.clock.nowIso() : null,
      },
    });

    db.cards.push(card);
    return resourceCreated(card);
  }),

  route(MockMethod.POST, routes.cards.activate(':id'), ({ db, params }) => {
    const card = db.cards.find((candidate) => candidate.id === params.id);
    if (!card) return cardMissing();
    if (card.status === CardStatus.ACTIVE) {
      return failure(ErrorCode.CONFLICT, 'This card is already active.');
    }
    return mutateCard(db.cards, params.id, (existing) => ({
      ...existing,
      status: CardStatus.ACTIVE,
      pinSet: true,
      activatedAt: db.clock.nowIso(),
    }));
  }),

  route(MockMethod.POST, routes.cards.freeze(':id'), ({ db, params }) => {
    const result = mutateCard(db.cards, params.id, (card) => ({
      ...card,
      status: CardStatus.FROZEN,
    }));
    notify(db, {
      category: NotificationCategory.CARD,
      title: 'Card frozen',
      body: 'Your card is frozen. Nothing can be spent on it until you unfreeze it.',
      severity: NotificationSeverity.WARNING,
    });
    return result;
  }),

  route(MockMethod.POST, routes.cards.unfreeze(':id'), ({ db, params }) =>
    mutateCard(db.cards, params.id, (card) => ({
      ...card,
      status: CardStatus.ACTIVE,
    })),
  ),

  route(MockMethod.POST, routes.cards.sensitive(':id'), ({ db, headers, params }) => {
    if (!headers.get(STEP_UP_HEADER)) {
      return failure(
        ErrorCode.STEP_UP_REQUIRED,
        'Confirm it is you before we show your card details.',
      );
    }

    const card = db.cards.find((candidate) => candidate.id === params.id);
    if (!card) return cardMissing();

    return raw({
      data: {
        pan: panFor(card),
        cvv: faker.string.numeric(3),
        expiry: `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`,
        cardholderName: card.cardholderName,
        validUntil: db.clock.minutesAhead(SENSITIVE_VALIDITY_MINUTES),
      },
    });
  }),

  route(MockMethod.PUT, routes.cards.pin(':id'), ({ db, params }) =>
    mutateCard(db.cards, params.id, (card) => ({ ...card, pinSet: true })),
  ),

  route(MockMethod.GET, routes.cards.controls(':id'), ({ db, params }) => {
    const card = db.cards.find((candidate) => candidate.id === params.id);
    return card ? resourceOk(card.controls) : cardMissing();
  }),

  route(MockMethod.PUT, routes.cards.controls(':id'), ({ body, db, params }) =>
    mutateCard(db.cards, params.id, (card) => ({
      ...card,
      controls: makeCardControls({ ...card.controls, ...(body as Partial<CardControls>) }),
    })),
  ),

  route(MockMethod.POST, routes.cards.report(':id'), ({ body, db, params }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const reason = typeof input.reason === 'string' ? input.reason : 'LOST';
    const result = mutateCard(db.cards, params.id, (card) => ({
      ...card,
      status: reason === 'STOLEN' ? CardStatus.STOLEN : CardStatus.LOST,
    }));

    if (input.orderReplacement !== false) {
      const original = db.cards.find((candidate) => candidate.id === params.id);
      if (original) {
        db.cards.push(
          makeCard({
            clock: db.clock,
            accountId: original.accountId,
            cardholderName: original.cardholderName,
            overrides: {
              id: mockId('crd'),
              status: CardStatus.ORDERED,
              replacesCardId: original.id,
              pinSet: false,
              activatedAt: null,
              orderedAt: db.clock.nowIso(),
            },
          }),
        );
      }
    }

    notify(db, {
      category: NotificationCategory.CARD,
      title: 'Card reported',
      body: 'Your card is blocked and a replacement is on its way.',
      severity: NotificationSeverity.CRITICAL,
    });
    return result;
  }),

  route(MockMethod.GET, routes.cards.transactions(':id'), ({ db, params, query }) => {
    const card = db.cards.find((candidate) => candidate.id === params.id);
    if (!card) return cardMissing();
    return paginate(
      db.transactions.filter((transaction) => transaction.accountId === card.accountId),
      query,
    );
  }),

  route(MockMethod.GET, routes.cards.byId(':id'), ({ db, params }) => {
    const card = db.cards.find((candidate) => candidate.id === params.id);
    return card ? resourceOk(card) : cardMissing();
  }),

  route(MockMethod.PATCH, routes.cards.byId(':id'), ({ body, db, params }) =>
    mutateCard(db.cards, params.id, (card) => ({
      ...card,
      ...(body as Partial<Card>),
    })),
  ),

  route(MockMethod.DELETE, routes.cards.byId(':id'), ({ db, params }) =>
    mutateCard(db.cards, params.id, (card) => ({
      ...card,
      status: CardStatus.CANCELLED,
    })),
  ),
];

function cardMissing() {
  return failure(ErrorCode.CARD_NOT_FOUND, 'That card was not found.');
}

function mutateCard(cards: Card[], id: string | undefined, change: (card: Card) => Card) {
  const index = cards.findIndex((candidate) => candidate.id === id);
  const card = cards[index];
  if (index === -1 || !card) return cardMissing();

  const updated = change(card);
  cards[index] = updated;
  return resourceOk(updated);
}

/**
 * A PAN built from the card's own last four, so the revealed number and the masked one
 * the customer sees everywhere else agree. A random PAN would look correct in isolation
 * and wrong the moment both appeared on the same screen.
 */
function panFor(card: Card): string {
  const prefix = card.scheme === 'VISA' ? '4' : '5';
  const middle = faker.string.numeric(11);
  const digits = `${prefix}${middle}${card.last4}`;
  return (digits.match(/.{1,4}/g) ?? [digits]).slice(0, PAN_GROUPS).join(' ');
}
