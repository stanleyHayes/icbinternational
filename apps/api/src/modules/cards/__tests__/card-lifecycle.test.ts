import {
  AuthorisationStatus,
  CardFormat,
  CardStatus,
  CardTier,
  DeclineReason,
} from '@reliance/contracts';

import { gbp, seedAccount, TEST_USER } from '../../accounts/__tests__/accounts-harness.js';
import { MAX_CARDS_PER_ACCOUNT, MAX_PIN_ATTEMPTS } from '../card.constants.js';
import { type CardRecord } from '../card.store.js';
import { expiryFrom } from '../issuing/card.factory.js';
import { canTransition, isTerminal } from '../lifecycle/card-status.rules.js';

import {
  cardsRig,
  purchase,
  seedActiveCard,
  TEST_CARDHOLDER,
  type CardsRig,
} from './cards-harness.js';

const PIN = '4821';

describe('issuing a card', () => {
  let rig: CardsRig;

  beforeEach(() => {
    rig = cardsRig();
  });

  it('makes a virtual card spendable immediately', async () => {
    const card = await seedActiveCard(rig);

    expect(card.status).toBe(CardStatus.ACTIVE);
    expect(card.activatedAt).not.toBeNull();
    expect(card.format).toBe(CardFormat.VIRTUAL);
  });

  it('puts a physical card into production, not into use', async () => {
    const card = await seedActiveCard(rig, { format: CardFormat.PHYSICAL });

    expect(card.status).toBe(CardStatus.ORDERED);
    expect(card.activatedAt).toBeNull();

    const attempt = await rig.authorise.authorise(purchase(card.id, 5_00));
    expect(attempt.declineReason).toBe(DeclineReason.CARD_NOT_ACTIVATED);
  });

  it('embosses the name from the verified profile, not from the request', async () => {
    const card = await seedActiveCard(rig);

    expect(card.cardholderName).toBe(TEST_CARDHOLDER);
  });

  it('makes the first card on an account its default', async () => {
    const accountId = await seedAccount(rig.accounts, { ledger: gbp(100_00) });

    const first = await issueOn(rig, accountId);
    const second = await issueOn(rig, accountId);

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
  });

  it('routes each tier to its scheme', async () => {
    const standard = await seedActiveCard(rig, { tier: CardTier.STANDARD });
    const metal = await seedActiveCard(rig, { tier: CardTier.METAL });

    expect(standard.scheme).toBe('VISA');
    expect(metal.scheme).toBe('MASTERCARD');
  });

  it('gives a premium card a higher opening ceiling', async () => {
    const standard = await seedActiveCard(rig, { tier: CardTier.STANDARD });
    const premium = await seedActiveCard(rig, { tier: CardTier.PREMIUM });

    expect(BigInt(premium.controls.dailySpendLimit?.amount ?? '0')).toBeGreaterThan(
      BigInt(standard.controls.dailySpendLimit?.amount ?? '0'),
    );
  });

  it('refuses a card the account has no room for', async () => {
    const accountId = await seedAccount(rig.accounts, { ledger: gbp(100_00) });
    for (let index = 0; index < MAX_CARDS_PER_ACCOUNT; index += 1) await issueOn(rig, accountId);

    await expect(issueOn(rig, accountId)).rejects.toThrow(/maximum of 5 cards/i);
  });

  it('expires at the end of the printed month, not its first instant', () => {
    const expiry = expiryFrom(new Date('2026-03-14T12:00:00.000Z'));

    expect(expiry.month).toBe(3);
    expect(expiry.year).toBe(2029);
    expect(expiry.at.toISOString()).toBe('2029-03-31T23:59:59.999Z');
  });
});

describe('the delivery run', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { format: CardFormat.PHYSICAL });
  });

  it('moves through print, dispatch and delivery on the simulated clock', async () => {
    expect(card.status).toBe(CardStatus.ORDERED);

    rig.clock.advance(days(1));
    expect((await rig.delivery.advance(card)).status).toBe(CardStatus.PRINTING);

    rig.clock.advance(days(1));
    expect((await rig.delivery.advance(await reload(rig, card))).status).toBe(CardStatus.SHIPPED);

    rig.clock.advance(days(3));
    expect((await rig.delivery.advance(await reload(rig, card))).status).toBe(CardStatus.DELIVERED);
  });

  it('catches a card up through several stages when the clock jumps', async () => {
    rig.clock.advance(days(7));

    const caught = await rig.delivery.advance(card);

    expect(caught.status).toBe(CardStatus.DELIVERED);
    expect(caught.printedAt).not.toBeNull();
    expect(caught.shippedAt).not.toBeNull();
  });

  it('leaves a virtual card alone — there is nothing to post', async () => {
    const virtual = await seedActiveCard(rig);
    rig.clock.advance(days(30));

    expect((await rig.delivery.advance(virtual)).status).toBe(CardStatus.ACTIVE);
  });

  it('does not make a delivered card spendable until it is activated', async () => {
    rig.clock.advance(days(7));
    const delivered = await rig.delivery.advance(card);

    const attempt = await rig.authorise.authorise(purchase(delivered.id, 5_00));
    expect(attempt.declineReason).toBe(DeclineReason.CARD_NOT_ACTIVATED);
  });
});

describe('activation', () => {
  let rig: CardsRig;
  let delivered: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    const ordered = await seedActiveCard(rig, { format: CardFormat.PHYSICAL });
    rig.clock.advance(days(7));
    delivered = await rig.delivery.advance(ordered);
  });

  it('activates on the right last four and sets the PIN in the same step', async () => {
    const active = await rig.lifecycle.activate({
      card: delivered,
      last4: delivered.last4,
      pin: PIN,
    });

    expect(active.status).toBe(CardStatus.ACTIVE);
    expect(active.pinHash).not.toBeNull();
    expect(active.activatedAt).not.toBeNull();
  });

  it('refuses last four that do not match the card we sent', async () => {
    await expect(
      rig.lifecycle.activate({ card: delivered, last4: '0000', pin: PIN }),
    ).rejects.toThrow(/do not match the card we sent/i);
  });

  it('refuses to activate a card that is already active', async () => {
    const active = await rig.lifecycle.activate({
      card: delivered,
      last4: delivered.last4,
      pin: PIN,
    });

    await expect(
      rig.lifecycle.activate({ card: active, last4: active.last4, pin: PIN }),
    ).rejects.toThrow(/already active/i);
  });
});

describe('freeze, unfreeze and cancel', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { balance: gbp(500_00) });
  });

  it('declines with CARD_FROZEN once frozen, and approves again once unfrozen', async () => {
    const frozen = await rig.lifecycle.freeze(card);
    const refused = await rig.authorise.authorise(purchase(frozen.id, 10_00));
    expect(refused.declineReason).toBe(DeclineReason.CARD_FROZEN);

    const thawed = await rig.lifecycle.unfreeze(frozen);
    const allowed = await rig.authorise.authorise(purchase(thawed.id, 10_00));
    expect(allowed.status).toBe(AuthorisationStatus.APPROVED);
  });

  it('cannot be unfrozen twice, because the second loses the conditional write', async () => {
    const frozen = await rig.lifecycle.freeze(card);
    await rig.lifecycle.unfreeze(frozen);

    await expect(rig.lifecycle.unfreeze(frozen)).rejects.toThrow(/updated a moment ago/i);
  });

  it('ends a cancelled card permanently', async () => {
    const cancelled = await rig.lifecycle.cancel(card, 'CUSTOMER_REQUEST');

    expect(cancelled.status).toBe(CardStatus.CANCELLED);
    expect(isTerminal(cancelled.status)).toBe(true);
    await expect(rig.lifecycle.unfreeze(cancelled)).rejects.toThrow(/cannot be active/i);
  });

  it('expires a card whose printed date has passed', async () => {
    rig.clock.freezeAt(new Date(card.expiresAt.getTime() + 1000));

    expect(await rig.lifecycle.expireDue()).toBe(1);

    const expired = await rig.cards.require(card.id);
    expect(expired.status).toBe(CardStatus.EXPIRED);
  });
});

describe('reporting a card', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { balance: gbp(500_00) });
  });

  it('blocks the card and issues a replacement pointing back at it', async () => {
    const { reported, replacement } = await rig.replacement.report({
      userId: TEST_USER,
      card,
      request: { reason: 'STOLEN', orderReplacement: true },
    });

    expect(reported.status).toBe(CardStatus.STOLEN);
    expect(replacement?.replacesCardId).toBe(card.id);

    const original = await rig.cards.require(card.id);
    expect(original.replacedByCardId).toBe(replacement?.id);
  });

  it('declines the stolen card without telling the holder it was reported', async () => {
    await rig.replacement.report({
      userId: TEST_USER,
      card,
      request: { reason: 'STOLEN', orderReplacement: false },
    });

    const attempt = await rig.authorise.authorise(purchase(card.id, 5_00));

    expect(attempt.declineReason).toBe(DeclineReason.SUSPECTED_FRAUD);
    expect(attempt.declineReason).not.toBe(DeclineReason.CARD_FROZEN);
  });

  it('gives the replacement a fresh PIN rather than inheriting the old one', async () => {
    const withPin = await rig.pins.set({ card, pin: PIN });

    const { replacement } = await rig.replacement.report({
      userId: TEST_USER,
      card: withPin,
      request: { reason: 'LOST', orderReplacement: true },
    });

    expect(withPin.pinHash).not.toBeNull();
    expect(replacement?.pinHash).toBeNull();
  });

  it('cancels rather than flags fraud for a damaged card', async () => {
    const { reported } = await rig.replacement.report({
      userId: TEST_USER,
      card,
      request: { reason: 'DAMAGED', orderReplacement: true },
    });

    expect(reported.status).toBe(CardStatus.CANCELLED);
  });

  it('issues no replacement when the customer declines one', async () => {
    const { replacement } = await rig.replacement.report({
      userId: TEST_USER,
      card,
      request: { reason: 'LOST', orderReplacement: false },
    });

    expect(replacement).toBeNull();
  });

  it('refuses to report a card that is already out of use', async () => {
    const cancelled = await rig.lifecycle.cancel(card, 'CUSTOMER_REQUEST');

    await expect(
      rig.replacement.report({
        userId: TEST_USER,
        card: cancelled,
        request: { reason: 'LOST', orderReplacement: true },
      }),
    ).rejects.toThrow(/already out of use/i);
  });
});

describe('the PIN', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { balance: gbp(500_00) });
    card = await rig.pins.set({ card, pin: PIN });
  });

  it('verifies the right PIN and refuses the wrong one', async () => {
    await expect(rig.pins.verify(card, PIN)).resolves.toBe(true);
    await expect(rig.pins.verify(await reload(rig, card), '0000')).rejects.toThrow(/not right/i);
  });

  it('locks the card after the allowed number of wrong tries', async () => {
    let current = card;
    for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
      await rig.pins.matches(current, '0000');
      current = await reload(rig, current);
    }

    expect(rig.pins.isLocked(current)).toBe(true);
    await expect(rig.pins.verify(current, PIN)).rejects.toThrow(/locked/i);
  });

  it('lets a PIN change unlock the card, which is the documented way out', async () => {
    let current = card;
    for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
      await rig.pins.matches(current, '0000');
      current = await reload(rig, current);
    }

    const reset = await rig.pins.set({ card: current, pin: '1357' });

    expect(rig.pins.isLocked(reset)).toBe(false);
    await expect(rig.pins.verify(reset, '1357')).resolves.toBe(true);
  });

  it('never exposes the PIN on the card record', async () => {
    expect(JSON.stringify(card)).not.toContain(PIN);
    expect(card.pinHash).not.toBe(PIN);
  });

  it('clears the counter after a correct entry', async () => {
    await rig.pins.matches(card, '0000');
    const afterMiss = await reload(rig, card);
    expect(afterMiss.pinAttempts).toBe(1);

    await rig.pins.matches(afterMiss, PIN);
    expect((await reload(rig, card)).pinAttempts).toBe(0);
  });
});

describe('the status table', () => {
  it('lets an active card be frozen but not printed', () => {
    expect(canTransition(CardStatus.ACTIVE, CardStatus.FROZEN)).toBe(true);
    expect(canTransition(CardStatus.ACTIVE, CardStatus.PRINTING)).toBe(false);
  });

  it('gives a stolen card no way back', () => {
    expect(isTerminal(CardStatus.STOLEN)).toBe(true);
    expect(canTransition(CardStatus.STOLEN, CardStatus.ACTIVE)).toBe(false);
  });
});

async function issueOn(rig: CardsRig, accountId: string): Promise<CardRecord> {
  return rig.issuing.issue({
    userId: TEST_USER,
    request: {
      accountId,
      format: CardFormat.VIRTUAL,
      tier: CardTier.STANDARD,
      deliveryAddressOverride: false,
    },
  });
}

async function reload(rig: CardsRig, card: CardRecord): Promise<CardRecord> {
  return rig.cards.require(card.id);
}

function days(count: number): number {
  return count * 24 * 60 * 60 * 1000;
}
