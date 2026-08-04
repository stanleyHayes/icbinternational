import { AuthorisationStatus, CardFormat, CardStatus, DeclineReason } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { declineDescriptorFor } from '../../../rails/card-network/index.js';
import { gbp } from '../../accounts/__tests__/accounts-harness.js';
import { toContractControls } from '../card.mapper.js';
import { type CardRecord } from '../card.store.js';

import {
  cardsRig,
  purchase,
  seedActiveCard,
  TEST_MERCHANT,
  type CardsRig,
} from './cards-harness.js';

/** The PIN the fixture card is activated with. */
const FIXTURE_PIN = '4821';

/**
 * **Every control has an authorisation test proving it declines.**
 *
 * A control that the app can display and the network ignores is worse than no control at
 * all: the customer believes their card is restricted and it is not. So none of these
 * tests asserts on stored state — each one turns the switch, presents a real payment
 * through the real decision path, and checks the issuer said no and said why.
 */
describe('card controls decline at authorisation', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { balance: gbp(1_000_00), format: CardFormat.PHYSICAL });
    card = await rig.lifecycle
      .move({
        card,
        to: CardStatus.ACTIVE,
        fields: {},
        from: [CardStatus.ORDERED],
      })
      .catch(() => activateDirectly(rig, card));
  });

  /** Replaces the card's controls and returns it, going through the real validator. */
  async function setControls(changes: Partial<ReturnType<typeof toContractControls>>) {
    const current = toContractControls(card.controls);
    card = await rig.controls.replace({
      userId: card.userId,
      cardId: card.id,
      controls: { ...current, ...changes },
    });
    return card;
  }

  it('approves an ordinary payment when nothing is in the way', async () => {
    const result = await rig.authorise.authorise(purchase(card.id, 25_00));

    expect(result.status).toBe(AuthorisationStatus.APPROVED);
    expect(result.declineReason).toBeNull();
    expect(result.responseCode).toBe('00');
    expect(result.holdId).not.toBeNull();
  });

  describe('channel switches', () => {
    it('declines an online payment when online payments are off', async () => {
      await setControls({ onlinePayments: false });

      const result = await rig.authorise.authorise(purchase(card.id, 10_00));

      expect(result.status).toBe(AuthorisationStatus.DECLINED);
      expect(result.declineReason).toBe(DeclineReason.CHANNEL_DISABLED);
      expect(result.responseCode).toBe(
        declineDescriptorFor(DeclineReason.CHANNEL_DISABLED).responseCode,
      );
      expect(result.holdId).toBeNull();
    });

    it('declines a contactless tap when contactless is off', async () => {
      await setControls({ contactless: false });

      const result = await rig.authorise.authorise(
        purchase(card.id, 4_50, { channel: 'CONTACTLESS' }),
      );

      expect(result.declineReason).toBe(DeclineReason.CHANNEL_DISABLED);
    });

    it('declines a cash withdrawal when ATM access is off', async () => {
      await setControls({ atmWithdrawals: false });

      const result = await rig.authorise.authorise(purchase(card.id, 50_00, { channel: 'ATM' }));

      expect(result.declineReason).toBe(DeclineReason.CHANNEL_DISABLED);
    });

    it('declines a magstripe swipe, which is off by default', async () => {
      const result = await rig.authorise.authorise(
        purchase(card.id, 12_00, { channel: 'MAGSTRIPE' }),
      );

      expect(result.declineReason).toBe(DeclineReason.CHANNEL_DISABLED);
    });

    it('still allows chip and PIN, which has no switch to turn off', async () => {
      await setControls({ onlinePayments: false, contactless: false, magstripe: false });

      const result = await rig.authorise.authorise(
        purchase(card.id, 12_00, { channel: 'CHIP', pin: FIXTURE_PIN }),
      );

      expect(result.status).toBe(AuthorisationStatus.APPROVED);
    });

    it('declines chip traffic that arrives with no PIN at all', async () => {
      const result = await rig.authorise.authorise(purchase(card.id, 12_00, { channel: 'CHIP' }));

      expect(result.declineReason).toBe(DeclineReason.INCORRECT_PIN);
    });

    it('declines a wrong PIN and leaves the money alone', async () => {
      const result = await rig.authorise.authorise(
        purchase(card.id, 12_00, { channel: 'CHIP', pin: '0000' }),
      );

      expect(result.declineReason).toBe(DeclineReason.INCORRECT_PIN);
      expect(result.holdId).toBeNull();
    });

    /**
     * The ordering that matters most in the whole decision: a card the customer froze
     * must not also lock their PIN when somebody taps it three times at a cash machine.
     */
    it('does not spend a PIN attempt on a card that was refused for another reason', async () => {
      const frozen = await rig.lifecycle.freeze(card);

      await rig.authorise.authorise(purchase(frozen.id, 20_00, { channel: 'ATM', pin: '0000' }));
      await rig.authorise.authorise(purchase(frozen.id, 20_00, { channel: 'ATM', pin: '0000' }));
      await rig.authorise.authorise(purchase(frozen.id, 20_00, { channel: 'ATM', pin: '0000' }));

      const after = await rig.cards.require(frozen.id);
      expect(after.pinAttempts).toBe(0);
      expect(after.pinLockedUntil).toBeNull();
    });
  });

  describe('geography', () => {
    it('declines abroad when international payments are off', async () => {
      const result = await rig.authorise.authorise(
        purchase(card.id, 30_00, { merchantCountry: 'FR' }),
      );

      expect(result.declineReason).toBe(DeclineReason.COUNTRY_BLOCKED);
    });

    it('approves abroad once international payments are on and the country is allowed', async () => {
      await setControls({ internationalPayments: true, allowedCountries: ['GB', 'FR'] });

      const result = await rig.authorise.authorise(
        purchase(card.id, 30_00, { merchantCountry: 'FR' }),
      );

      expect(result.status).toBe(AuthorisationStatus.APPROVED);
    });

    it('declines a country left off the allow-list even with international on', async () => {
      await setControls({ internationalPayments: true, allowedCountries: ['GB', 'FR'] });

      const result = await rig.authorise.authorise(
        purchase(card.id, 30_00, { merchantCountry: 'ES' }),
      );

      expect(result.declineReason).toBe(DeclineReason.COUNTRY_BLOCKED);
    });

    it('treats an empty allow-list as "anywhere international payments permit"', async () => {
      await setControls({ internationalPayments: true, allowedCountries: [] });

      const result = await rig.authorise.authorise(
        purchase(card.id, 30_00, { merchantCountry: 'JP' }),
      );

      expect(result.status).toBe(AuthorisationStatus.APPROVED);
    });
  });

  describe('merchant rules', () => {
    it('declines a blocked merchant category', async () => {
      await setControls({ blockedMccs: ['5812'] });

      const result = await rig.authorise.authorise(purchase(card.id, 8_00));

      expect(result.declineReason).toBe(DeclineReason.MERCHANT_BLOCKED);
    });

    it('declines gambling, which is blocked out of the envelope', async () => {
      const result = await rig.authorise.authorise(purchase(card.id, 20_00, { mcc: '7995' }));

      expect(result.declineReason).toBe(DeclineReason.MERCHANT_BLOCKED);
    });

    it('declines any merchant but the one a virtual card is locked to', async () => {
      const virtual = await seedActiveCard(rig, { balance: gbp(200_00) });
      await rig.controls.lockToMerchant({
        userId: virtual.userId,
        cardId: virtual.id,
        merchantId: 'mrc_streaming_service',
      });

      const elsewhere = await rig.authorise.authorise(purchase(virtual.id, 9_99));
      expect(elsewhere.declineReason).toBe(DeclineReason.MERCHANT_BLOCKED);

      const atTheLock = await rig.authorise.authorise(
        purchase(virtual.id, 9_99, { merchantId: 'mrc_streaming_service' }),
      );
      expect(atTheLock.status).toBe(AuthorisationStatus.APPROVED);
    });

    it('refuses to lock a physical card to one merchant', async () => {
      await expect(
        rig.controls.lockToMerchant({
          userId: card.userId,
          cardId: card.id,
          merchantId: TEST_MERCHANT.merchantId,
        }),
      ).rejects.toThrow(/virtual card/i);
    });
  });

  describe('spending limits', () => {
    it('declines a payment over the per-transaction ceiling', async () => {
      await setControls({ perTransactionLimit: gbp(20_00).toJSON() });

      const result = await rig.authorise.authorise(purchase(card.id, 20_01));

      expect(result.declineReason).toBe(DeclineReason.LIMIT_EXCEEDED);
    });

    it('declines the payment that would break the daily ceiling', async () => {
      await setControls({ dailySpendLimit: gbp(50_00).toJSON() });

      const first = await rig.authorise.authorise(purchase(card.id, 40_00));
      expect(first.status).toBe(AuthorisationStatus.APPROVED);

      const second = await rig.authorise.authorise(purchase(card.id, 15_00));
      expect(second.declineReason).toBe(DeclineReason.LIMIT_EXCEEDED);
    });

    it('counts an uncaptured hold against the daily ceiling', async () => {
      await setControls({ dailySpendLimit: gbp(30_00).toJSON() });

      const held = await rig.authorise.authorise(purchase(card.id, 25_00));
      expect(held.status).toBe(AuthorisationStatus.APPROVED);
      expect(held.capturedAmount).toBeNull();

      const next = await rig.authorise.authorise(purchase(card.id, 10_00));
      expect(next.declineReason).toBe(DeclineReason.LIMIT_EXCEEDED);
    });

    it('declines a withdrawal over the daily cash ceiling while card spend still passes', async () => {
      await setControls({ dailyAtmLimit: gbp(20_00).toJSON() });

      const cash = await rig.authorise.authorise(
        purchase(card.id, 25_00, { channel: 'ATM', pin: FIXTURE_PIN }),
      );
      expect(cash.declineReason).toBe(DeclineReason.LIMIT_EXCEEDED);

      const spend = await rig.authorise.authorise(
        purchase(card.id, 25_00, { channel: 'CHIP', pin: FIXTURE_PIN }),
      );
      expect(spend.status).toBe(AuthorisationStatus.APPROVED);
    });

    it('declines a payment over the monthly ceiling', async () => {
      await setControls({ monthlySpendLimit: gbp(60_00).toJSON() });

      await rig.authorise.authorise(purchase(card.id, 55_00));
      const over = await rig.authorise.authorise(purchase(card.id, 10_00));

      expect(over.declineReason).toBe(DeclineReason.LIMIT_EXCEEDED);
    });

    it('refuses a limit set in the wrong currency', async () => {
      await expect(
        setControls({ dailySpendLimit: Money.fromMinor(1000, 'EUR').toJSON() }),
      ).rejects.toThrow(/GBP/);
    });

    it('reports how much of each ceiling is left', async () => {
      await setControls({ dailySpendLimit: gbp(100_00).toJSON() });
      await rig.authorise.authorise(purchase(card.id, 30_00));

      const limits = await rig.controls.limits(card.userId, card.id);

      expect(limits.daily?.used.toJSON()).toEqual(gbp(30_00).toJSON());
      expect(limits.daily?.remaining.toJSON()).toEqual(gbp(70_00).toJSON());
    });
  });

  describe('funds', () => {
    it('declines when the available balance cannot cover the payment', async () => {
      const thin = await seedActiveCard(rig, { balance: gbp(5_00) });

      const result = await rig.authorise.authorise(purchase(thin.id, 25_00));

      expect(result.declineReason).toBe(DeclineReason.INSUFFICIENT_FUNDS);
      expect(result.holdId).toBeNull();
    });

    it('approves for less when the merchant accepts a partial approval', async () => {
      const thin = await seedActiveCard(rig, { balance: gbp(18_50) });

      const result = await rig.authorise.authorise(
        purchase(thin.id, 40_00, { partialApprovalAllowed: true, channel: 'CHIP' }),
      );

      expect(result.status).toBe(AuthorisationStatus.APPROVED);
      expect(result.amount).toEqual(gbp(18_50).toJSON());
      expect(result.requestedAmount).toEqual(gbp(40_00).toJSON());
    });
  });
});

/** A physical card that is already in the customer's hands, for the control fixtures. */
async function activateDirectly(rig: CardsRig, card: CardRecord): Promise<CardRecord> {
  const delivered = await rig.cardStore.patch({
    cardId: card.id,
    fields: { status: CardStatus.DELIVERED },
  });
  if (!delivered) throw new Error('Fixture card vanished before activation');

  return rig.lifecycle.activate({ card: delivered, last4: delivered.last4, pin: FIXTURE_PIN });
}
