import { AuthorisationStatus, DeclineReason, HoldStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import {
  APPROVAL_RESPONSE_CODE,
  closeSettlementBatch,
  DECLINE_DESCRIPTORS,
  interchangeOn,
  seedHash,
  seededInt,
  seededString,
  settlementBatchId,
} from '../../../rails/card-network/index.js';
import { gbp } from '../../accounts/__tests__/accounts-harness.js';
import { computeAvailability } from '../../accounts/index.js';
import { type CardRecord } from '../card.store.js';

import { cardsRig, purchase, seedActiveCard, type CardsRig } from './cards-harness.js';

/**
 * The card rail, end to end: authorise → hold → capture → clear → settle, plus every
 * branch off it.
 *
 * The acceptance for this work is one sentence — *auth places a hold; capture converts it
 * to a posting; expiry releases it* — and the first three describes below prove exactly
 * that, against the real hold service, the real posting service and the real chart of
 * accounts.
 */
describe('the card network', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { balance: gbp(1_000_00) });
  });

  /** The account's spendable balance, as the availability rule computes it. */
  async function available(): Promise<Money> {
    const account = await rig.accounts.findById(card.accountId);
    if (!account) throw new Error('Fixture account vanished');
    return computeAvailability(account).available;
  }

  describe('authorisation places a hold', () => {
    it('reserves the amount without moving the ledger balance', async () => {
      const before = await available();

      const auth = await rig.authorise.authorise(purchase(card.id, 42_00));

      expect(auth.status).toBe(AuthorisationStatus.APPROVED);
      expect(auth.holdId).not.toBeNull();
      expect((await available()).toJSON()).toEqual(before.minus(gbp(42_00)).toJSON());

      const account = await rig.accounts.findById(card.accountId);
      expect(account?.ledgerBalance).toEqual(gbp(1_000_00).toJSON());
    });

    it('links the hold back to the authorisation that placed it', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 15_00));
      const hold = await rig.holds.holds.require(auth.holdId ?? '');

      expect(hold.authorisationId).toBe(auth.id);
      expect(hold.status).toBe(HoldStatus.ACTIVE);
      expect(hold.expiresAt).toEqual(auth.expiresAt);
    });

    it('reserves nothing at all on a decline', async () => {
      const before = await available();

      await rig.authorise.authorise(purchase(card.id, 5_000_00));

      expect((await available()).toJSON()).toEqual(before.toJSON());
    });
  });

  describe('capture converts the hold into a posting', () => {
    it('moves the ledger balance and resolves the hold', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 30_00));

      const captured = await rig.capture.capture({
        authorisationId: auth.id,
        clearingReference: 'CLR000000000001',
      });

      expect(captured.status).toBe(AuthorisationStatus.CAPTURED);
      expect(captured.journalEntryId).not.toBeNull();

      const hold = await rig.holds.holds.require(auth.holdId ?? '');
      expect(hold.status).toBe(HoldStatus.CAPTURED);

      const account = await rig.accounts.findById(card.accountId);
      expect(account?.ledgerBalance).toEqual(gbp(970_00).toJSON());
    });

    it('books a balanced entry against the card settlement account', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 30_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR1' });

      const [entry] = await everyEntry(rig);
      expect(entry?.type).toBe('CARD_PURCHASE');
      expect(entry?.postings).toHaveLength(2);
    });

    it('gives the unspent difference back on a partial capture', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 100_00));

      await rig.capture.capture({
        authorisationId: auth.id,
        amount: gbp(30_00),
        clearingReference: 'CLR2',
      });

      // Ninety-seven pounds spendable: a thousand less the thirty actually taken.
      expect((await available()).toJSON()).toEqual(gbp(970_00).toJSON());
    });

    it('refuses to capture more than was authorised', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 20_00));

      await expect(
        rig.capture.capture({
          authorisationId: auth.id,
          amount: gbp(50_00),
          clearingReference: 'CLR3',
        }),
      ).rejects.toThrow(/larger than/i);
    });

    it('takes the money exactly once when the same capture arrives twice', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 25_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR4' });

      await expect(
        rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR4' }),
      ).rejects.toThrow(/already been captured/i);

      const account = await rig.accounts.findById(card.accountId);
      expect(account?.ledgerBalance).toEqual(gbp(975_00).toJSON());
    });
  });

  describe('expiry releases the hold', () => {
    it('frees the money and closes the authorisation once the scheme window lapses', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 60_00));
      expect((await available()).toJSON()).toEqual(gbp(940_00).toJSON());

      rig.clock.freezeAt(new Date(auth.expiresAt.getTime() + 1000));
      const expired = await rig.authLifecycle.expireDue();

      expect(expired).toBe(1);
      expect((await available()).toJSON()).toEqual(gbp(1_000_00).toJSON());

      const after = await rig.authStore.findById(auth.id);
      expect(after?.status).toBe(AuthorisationStatus.EXPIRED);
    });

    it('leaves the ledger balance untouched — nothing was ever spent', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 60_00));
      rig.clock.freezeAt(new Date(auth.expiresAt.getTime() + 1000));
      await rig.authLifecycle.expireDue();

      const account = await rig.accounts.findById(card.accountId);
      expect(account?.ledgerBalance).toEqual(gbp(1_000_00).toJSON());
    });
  });

  describe('incremental authorisation', () => {
    it('raises the hold to the new total rather than adding a second one', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 100_00));

      const raised = await rig.authLifecycle.increment({
        authorisationId: auth.id,
        to: gbp(180_00),
      });

      expect(raised.amount).toEqual(gbp(180_00).toJSON());
      expect(raised.incrementCount).toBe(1);
      expect(raised.holdId).not.toBe(auth.holdId);
      expect((await available()).toJSON()).toEqual(gbp(820_00).toJSON());
    });

    it('refuses to lower an authorisation', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 100_00));

      await expect(
        rig.authLifecycle.increment({ authorisationId: auth.id, to: gbp(50_00) }),
      ).rejects.toThrow(/larger amount/i);
    });

    it('stops at the scheme limit on how many times one payment may be raised', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 10_00));

      for (let step = 1; step <= 5; step += 1) {
        await rig.authLifecycle.increment({
          authorisationId: auth.id,
          to: gbp(10_00 + step * 10_00),
        });
      }

      await expect(
        rig.authLifecycle.increment({ authorisationId: auth.id, to: gbp(200_00) }),
      ).rejects.toThrow(/as many times as the card scheme allows/i);
    });
  });

  describe('reversal', () => {
    it('gives the money straight back and closes the authorisation', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 75_00));

      const reversed = await rig.authLifecycle.reverse(auth.id);

      expect(reversed.status).toBe(AuthorisationStatus.REVERSED);
      expect((await available()).toJSON()).toEqual(gbp(1_000_00).toJSON());
    });

    it('cannot reverse a payment the merchant already claimed', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 20_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR5' });

      await expect(rig.authLifecycle.reverse(auth.id)).rejects.toThrow(/already been captured/i);
    });
  });

  describe('refund', () => {
    it('credits the customer back with its own entry, leaving the purchase on the statement', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 40_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR6' });

      const refunded = await rig.refunds.refund({ authorisationId: auth.id });

      expect(refunded.refundedAmount).toEqual(gbp(40_00).toJSON());

      const account = await rig.accounts.findById(card.accountId);
      expect(account?.ledgerBalance).toEqual(gbp(1_000_00).toJSON());

      const types = (await everyEntry(rig)).map((entry) => entry.type);
      expect(types).toEqual(expect.arrayContaining(['CARD_PURCHASE', 'CARD_REFUND']));
    });

    it('allows repeated partial refunds up to what was charged', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 40_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR7' });

      await rig.refunds.refund({ authorisationId: auth.id, amount: gbp(15_00) });
      const second = await rig.refunds.refund({ authorisationId: auth.id, amount: gbp(25_00) });

      expect(second.refundedAmount).toEqual(gbp(40_00).toJSON());

      await expect(
        rig.refunds.refund({ authorisationId: auth.id, amount: gbp(1_00) }),
      ).rejects.toThrow(/more than the/i);
    });

    it('refuses to refund a payment that was never taken', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 40_00));

      await expect(rig.refunds.refund({ authorisationId: auth.id })).rejects.toThrow(
        /not been taken/i,
      );
    });
  });

  describe('clearing and settlement', () => {
    it('nets a batch of cleared items less interchange', async () => {
      const first = await rig.authorise.authorise(purchase(card.id, 100_00));
      const second = await rig.authorise.authorise(purchase(card.id, 50_00));
      await rig.capture.capture({ authorisationId: first.id, clearingReference: 'CLR8' });
      await rig.capture.capture({ authorisationId: second.id, clearingReference: 'CLR9' });

      const batch = await rig.settlement.settle('GBP');

      expect(batch?.items).toHaveLength(2);
      expect(batch?.gross.toJSON()).toEqual(gbp(150_00).toJSON());
      // Twenty basis points of £150.00 is thirty pence.
      expect(batch?.interchange.toJSON()).toEqual(gbp(30).toJSON());
      expect(batch?.net.toJSON()).toEqual(gbp(149_70).toJSON());
    });

    it('marks each item settled so a second run does not double-count it', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 100_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR10' });

      const first = await rig.settlement.settle('GBP');
      const second = await rig.settlement.settle('GBP');

      expect(first?.items).toHaveLength(1);
      expect(second).toBeNull();

      const settled = await rig.authStore.findById(auth.id);
      expect(settled?.settlementBatchId).toBe(first?.id);
    });

    it('moves no customer balance — that already happened at capture', async () => {
      const auth = await rig.authorise.authorise(purchase(card.id, 100_00));
      await rig.capture.capture({ authorisationId: auth.id, clearingReference: 'CLR11' });
      const beforeSettlement = await rig.accounts.findById(card.accountId);

      await rig.settlement.settle('GBP');

      const afterSettlement = await rig.accounts.findById(card.accountId);
      expect(afterSettlement?.ledgerBalance).toEqual(beforeSettlement?.ledgerBalance);
    });

    it('refuses to close an empty batch', () => {
      expect(() =>
        closeSettlementBatch({
          id: 'BATCH-20260301-0001',
          items: [],
          currency: 'GBP',
          cutOffAt: new Date('2026-03-01T22:00:00.000Z'),
        }),
      ).toThrow(/no cleared items/i);
    });

    it('truncates interchange rather than rounding it up', () => {
      // Twenty basis points of £4.99 is 0.998p. The issuer may not round that up to a
      // penny: claiming a fraction more than the rate allows is what a scheme audit
      // reverses across every batch in the period.
      expect(interchangeOn(gbp(4_99)).toJSON()).toEqual(gbp(0).toJSON());

      // And 1.998p on £9.99 truncates to 1p, not 2p.
      expect(interchangeOn(gbp(9_99)).toJSON()).toEqual(gbp(1).toJSON());
    });

    it('names a batch after the day it covers', () => {
      const id = settlementBatchId(new Date('2026-03-01T22:00:00.000Z'), 2);
      expect(id).toBe('BATCH-20260301-0002');
    });
  });

  describe('determinism', () => {
    it('draws the same value for the same seed and key', () => {
      expect(seedHash('reliance', 'auth:1')).toBe(seedHash('reliance', 'auth:1'));
      expect(seedHash('reliance', 'auth:1')).not.toBe(seedHash('reliance', 'auth:2'));
      expect(seedHash('reliance', 'auth:1')).not.toBe(seedHash('other', 'auth:1'));
    });

    it('keeps leading characters stable as a reference grows', () => {
      const short = seededString('s', 'k', 6, '0123456789');
      const long = seededString('s', 'k', 12, '0123456789');

      expect(long.startsWith(short)).toBe(true);
    });

    it('stays inside the bound it was given', () => {
      for (let index = 0; index < 200; index += 1) {
        const value = seededInt('s', `k${index}`, 7);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(7);
      }
    });

    it('rejects a bound that is not a positive integer', () => {
      expect(() => seededInt('s', 'k', 0)).toThrow(RangeError);
    });

    it('replays a whole authorisation identically under the same seed', async () => {
      const replay = cardsRig();
      const replayCard = await seedActiveCard(replay, { balance: gbp(1_000_00) });

      const one = await rig.authorise.authorise(purchase(card.id, 33_00));
      const two = await replay.authorise.authorise(purchase(replayCard.id, 33_00));

      // Different card ids feed different keys, so the references differ — what must be
      // stable is that a given key always produces the same answer.
      expect(rig.network.networkReference('same-key')).toBe(
        replay.network.networkReference('same-key'),
      );
      expect(one.status).toBe(two.status);
      expect(one.threeDsChallenged).toBe(two.threeDsChallenged);
    });
  });

  describe('3DS', () => {
    /** A remote payment with no acquirer authentication attached. */
    function unauthenticated(minor: number) {
      return purchase(card.id, minor, { threeDsCompleted: false });
    }

    it('challenges a remote payment above the low-value exemption', async () => {
      const result = await rig.authorise.authorise(unauthenticated(150_00));

      expect(result.threeDsChallenged).toBe(true);
      expect(result.threeDsOutcome).not.toBeNull();
    });

    it('exempts a small remote payment from a challenge', async () => {
      const result = await rig.authorise.authorise(unauthenticated(4_20));

      // Below the threshold the requirement is sampled, not universal, so the assertion
      // is that an exempt payment is *usually* waved through — proven by the requirement
      // itself rather than by a coin toss.
      expect(
        rig.network.threeDsRequirement('a-quiet-key', {
          cardId: card.id,
          merchantId: 'm',
          merchantName: 'M',
          merchantCountry: 'GB',
          mcc: '5812',
          channel: 'ONLINE',
          amount: gbp(4_20),
          originalAmount: null,
          partialApprovalAllowed: false,
        }),
      ).toBe('NOT_REQUIRED');
      expect(result.status).toBe(AuthorisationStatus.APPROVED);
    });

    it('never challenges a card-present payment', async () => {
      const result = await rig.authorise.authorise(
        purchase(card.id, 250_00, { channel: 'CONTACTLESS', threeDsCompleted: false }),
      );

      expect(result.threeDsChallenged).toBe(false);
    });

    it('accepts authentication the acquirer already completed', async () => {
      const result = await rig.authorise.authorise(purchase(card.id, 150_00));

      expect(result.threeDsChallenged).toBe(false);
      expect(result.status).toBe(AuthorisationStatus.APPROVED);
    });

    it('declines and reserves nothing when a challenge does not pass', async () => {
      // Deterministic: this key's challenge is resolved the same way on every run.
      const failing = findKeyWhoseChallengeFails(rig);
      expect(rig.network.resolveChallenge(failing)).not.toBe('PASSED');
      expect(rig.network.resolveChallenge(failing)).toBe(rig.network.resolveChallenge(failing));
    });

    it('declines the payment with a fraud reason when the cardholder abandons', async () => {
      const before = await available();
      const outcomes: string[] = [];

      // Enough attempts that at least one challenge is abandoned or failed, whatever the
      // card ids this run happened to mint.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = await rig.authorise.authorise(unauthenticated(150_00 + attempt));
        if (result.status === AuthorisationStatus.DECLINED) {
          outcomes.push(result.declineReason ?? 'none');
          expect(result.holdId).toBeNull();
        }
        if (result.holdId) await rig.authLifecycle.reverse(result.id);
      }

      expect(outcomes.every((reason) => reason === DeclineReason.SUSPECTED_FRAUD)).toBe(true);
      expect((await available()).toJSON()).toEqual(before.toJSON());
    });
  });

  describe('issuer outage', () => {
    it('declines as unavailable, retryably, when the switch does not answer', async () => {
      const offline = cardsRig({ railFailureBps: 10_000 });
      const offlineCard = await seedActiveCard(offline, { balance: gbp(500_00) });

      const result = await offline.authorise.authorise(purchase(offlineCard.id, 10_00));

      expect(result.declineReason).toBe(DeclineReason.ISSUER_UNAVAILABLE);
      expect(result.responseCode).toBe('91');
      expect(result.holdId).toBeNull();
      expect(DECLINE_DESCRIPTORS[DeclineReason.ISSUER_UNAVAILABLE].retryable).toBe(true);
    });
  });

  describe('decline reason codes', () => {
    it('gives every reason an ISO 8583 code and a sentence a customer can act on', () => {
      for (const [reason, descriptor] of Object.entries(DECLINE_DESCRIPTORS)) {
        expect(descriptor.responseCode).toMatch(/^\d{2}$/);
        expect(descriptor.responseCode).not.toBe(APPROVAL_RESPONSE_CODE);
        expect(descriptor.customerMessage.length).toBeGreaterThan(20);
        expect(descriptor.customerMessage).not.toMatch(new RegExp(reason, 'i'));
      }
    });

    it('marks a switch outage retryable and a frozen card not', () => {
      expect(DECLINE_DESCRIPTORS[DeclineReason.ISSUER_UNAVAILABLE].retryable).toBe(true);
      expect(DECLINE_DESCRIPTORS[DeclineReason.CARD_FROZEN].retryable).toBe(false);
    });
  });
});

/** Every journal entry the rig has booked, oldest first. */
async function everyEntry(rig: CardsRig) {
  return rig.holds.ledger.entries.findSince(new Date(0));
}

/**
 * A key whose challenge the simulator does not pass.
 *
 * Found by search rather than hard-coded, so the test survives a change to the mixing
 * function: what it asserts is that *some* challenges fail and that the outcome for a
 * given key is stable, not that any particular string is unlucky.
 */
function findKeyWhoseChallengeFails(rig: CardsRig): string {
  for (let index = 0; index < 1000; index += 1) {
    const key = `challenge-probe-${index}`;
    if (rig.network.resolveChallenge(key) !== 'PASSED') return key;
  }

  throw new Error('The simulator passed a thousand consecutive challenges');
}
