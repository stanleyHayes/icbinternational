import { Injectable, Logger } from '@nestjs/common';

import { CardFormat, ErrorCode, type CardControls } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { fromWire } from '../../../common/money/money.codec.js';
import { SpendWindowReader } from '../authorisation/spend-window.reader.js';
import { cardChangedUnderneath } from '../card.errors.js';
import { toContractControls } from '../card.mapper.js';
import { CardService } from '../card.service.js';
import { CardStore, type CardRecord, type StoredCardControls } from '../card.store.js';

import { limitSnapshot, type CardLimitSnapshot } from './spend-limits.js';

/**
 * The switches and ceilings a customer sets on their own card.
 *
 * Every control here is a promise the bank keeps at authorisation time, in
 * `control-rules.ts` and `spend-limits.ts`. That is why this service does so little: it
 * validates and stores, and the enforcement lives with the decision, so there is no way
 * to add a control the app can display and the network ignores.
 */
@Injectable()
export class CardControlsService {
  private readonly logger = new Logger(CardControlsService.name);

  constructor(
    private readonly cards: CardService,
    private readonly store: CardStore,
    private readonly windows: SpendWindowReader,
  ) {}

  /** The card's current controls. */
  async get(userId: string, cardId: string): Promise<CardControls> {
    const card = await this.cards.requireOwned(userId, cardId);
    return toContractControls(card.controls);
  }

  /**
   * Replaces the card's controls wholesale.
   *
   * A full replacement rather than a patch, because the client already holds the complete
   * object and a partial update would make "the customer turned contactless off" and "the
   * client omitted the field" indistinguishable — with the safer reading being the wrong
   * one half the time.
   *
   * @throws {AppError} `VALIDATION_FAILED` for a limit in the wrong currency or a switch
   *   the card's format cannot honour.
   */
  async replace(input: {
    userId: string;
    cardId: string;
    controls: CardControls;
  }): Promise<CardRecord> {
    const card = await this.cards.requireOwned(input.userId, input.cardId);
    const stored = this.toStored(card, input.controls);

    const patched = await this.store.patch({ cardId: card.id, fields: { controls: stored } });
    if (!patched) throw cardChangedUnderneath(card.id);

    this.logger.log(`Controls updated on card ${card.id}`);
    return patched;
  }

  /**
   * Locks a virtual card to one merchant, or releases it.
   *
   * The point of a per-merchant lock is that a number leaked by one subscription buys
   * nothing anywhere else, so it is offered only on virtual cards: a physical card locked
   * to a single merchant would be a card the customer cannot use, which is a support call
   * rather than a feature.
   *
   * @throws {AppError} `PRECONDITION_FAILED` on a physical card.
   */
  async lockToMerchant(input: {
    userId: string;
    cardId: string;
    merchantId: string | null;
  }): Promise<CardRecord> {
    const card = await this.cards.requireOwned(input.userId, input.cardId);

    if (card.format !== CardFormat.VIRTUAL) {
      throw new AppError({
        code: ErrorCode.PRECONDITION_FAILED,
        message:
          'Only a virtual card can be locked to one merchant. Order a virtual card for the subscription you want to ring-fence.',
        context: { cardId: card.id, format: card.format },
      });
    }

    const patched = await this.store.patch({
      cardId: card.id,
      fields: { lockedMerchantId: input.merchantId },
    });
    if (!patched) throw cardChangedUnderneath(card.id);

    this.logger.log(
      input.merchantId
        ? `Card ${card.id} locked to merchant ${input.merchantId}`
        : `Merchant lock cleared on card ${card.id}`,
    );
    return patched;
  }

  /** Each ceiling with how much of it is left, for the controls screen. */
  async limits(userId: string, cardId: string): Promise<CardLimitSnapshot> {
    const card = await this.cards.requireOwned(userId, cardId);

    return limitSnapshot({
      controls: card.controls,
      windows: await this.windows.read(card.id),
      currency: card.currency as CurrencyCode,
    });
  }

  /**
   * Validates the incoming controls and converts them for storage.
   *
   * The currency check is the one that matters: a daily limit denominated in euros on a
   * sterling card would silently never bind, because the comparison throws rather than
   * declines and the throw would be caught as a rail fault.
   */
  private toStored(card: CardRecord, controls: CardControls): StoredCardControls {
    const currency = card.currency;
    const limit = (value: CardControls['dailySpendLimit'], field: string) => {
      if (!value) return null;
      if (value.currency !== currency) throw currencyMismatch(card, field, value.currency);
      return { amount: fromWire(value).amount.toString(), currency };
    };

    return {
      onlinePayments: controls.onlinePayments,
      // A virtual card has no chip to tap; claiming otherwise would be a control that
      // governs nothing, which is worse than not offering it.
      contactless: card.format === CardFormat.PHYSICAL && controls.contactless,
      atmWithdrawals: card.format === CardFormat.PHYSICAL && controls.atmWithdrawals,
      internationalPayments: controls.internationalPayments,
      magstripe: card.format === CardFormat.PHYSICAL && controls.magstripe,
      perTransactionLimit: limit(controls.perTransactionLimit, 'perTransactionLimit'),
      dailySpendLimit: limit(controls.dailySpendLimit, 'dailySpendLimit'),
      monthlySpendLimit: limit(controls.monthlySpendLimit, 'monthlySpendLimit'),
      dailyAtmLimit: limit(controls.dailyAtmLimit, 'dailyAtmLimit'),
      blockedMccs: [...new Set(controls.blockedMccs)],
      allowedCountries: [...new Set(controls.allowedCountries.map((code) => code.toUpperCase()))],
    };
  }
}

function currencyMismatch(card: CardRecord, field: string, given: string): AppError {
  return new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `Set this card's limits in ${card.currency}. We received ${given}.`,
    context: { cardId: card.id, field, expected: card.currency, given },
  });
}
