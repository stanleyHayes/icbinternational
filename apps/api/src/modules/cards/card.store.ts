import { type ClientSession } from 'mongoose';

import {
  type CardFormat,
  type CardScheme,
  type CardStatus,
  type CardTier,
} from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * Channel switches and ceilings as they are stored.
 *
 * Identical in shape to the contract's `CardControls` except that amounts are
 * {@link StoredMoney}. Keeping the two shapes parallel means the mapper is a
 * field-for-field translation with nowhere for a rule to hide.
 */
export interface StoredCardControls {
  readonly onlinePayments: boolean;
  readonly contactless: boolean;
  readonly atmWithdrawals: boolean;
  readonly internationalPayments: boolean;
  readonly magstripe: boolean;
  readonly perTransactionLimit: StoredMoney | null;
  readonly dailySpendLimit: StoredMoney | null;
  readonly monthlySpendLimit: StoredMoney | null;
  readonly dailyAtmLimit: StoredMoney | null;
  readonly blockedMccs: readonly string[];
  readonly allowedCountries: readonly string[];
}

/** A persisted card as services see it — a plain value, with no `.save()` on it. */
export interface CardRecord {
  readonly id: string;
  readonly accountId: string;
  readonly userId: string;
  readonly format: CardFormat;
  readonly scheme: CardScheme;
  readonly tier: CardTier;
  readonly status: CardStatus;
  readonly nickname: string | null;
  readonly cardholderName: string;
  /** Opaque handle on the card number. The PAN itself is stored nowhere. */
  readonly panToken: string;
  readonly last4: string;
  readonly bin: string;
  readonly expiryMonth: number;
  readonly expiryYear: number;
  readonly currency: string;
  readonly controls: StoredCardControls;
  readonly lockedMerchantId: string | null;
  readonly isDefault: boolean;
  /** Argon2 digest. Present means a PIN is set; the PIN itself is unrecoverable. */
  readonly pinHash: string | null;
  readonly pinAttempts: number;
  readonly pinLockedUntil: Date | null;
  readonly replacesCardId: string | null;
  readonly replacedByCardId: string | null;
  readonly reportedReason: string | null;
  readonly orderedAt: Date;
  readonly printedAt: Date | null;
  readonly shippedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly activatedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly expiresAt: Date;
}

/** A card on its way in. The store assigns nothing but the timestamps Mongo owns. */
export type NewCard = Omit<CardRecord, 'nickname'> & { readonly nickname: string | null };

/** Fields a service may change after issuing. Everything absent from this type is fixed. */
export interface CardPatchFields {
  readonly status?: CardStatus;
  readonly nickname?: string | null;
  readonly tier?: CardTier;
  readonly controls?: StoredCardControls;
  readonly lockedMerchantId?: string | null;
  readonly isDefault?: boolean;
  readonly pinHash?: string;
  readonly pinAttempts?: number;
  readonly pinLockedUntil?: Date | null;
  readonly replacedByCardId?: string | null;
  readonly reportedReason?: string | null;
  readonly printedAt?: Date;
  readonly shippedAt?: Date;
  readonly deliveredAt?: Date;
  readonly activatedAt?: Date;
  readonly cancelledAt?: Date;
  readonly expiresAt?: Date;
}

export interface CardPatchInput {
  readonly cardId: string;
  readonly fields: CardPatchFields;
  /**
   * Only apply the patch if the card is currently in one of these states.
   *
   * This is the whole concurrency story for a card. Freeze, cancel and report all race
   * with an authorisation reading the same document, and a conditional write is what
   * makes exactly one of them win rather than the last writer silently overwriting a
   * status somebody set for a reason.
   */
  readonly expectedStatuses?: readonly CardStatus[];
  readonly session?: ClientSession;
}

export interface CardQuery {
  readonly userId: string;
  readonly accountId?: string;
  readonly status?: CardStatus;
  readonly cursor?: string;
  readonly limit: number;
}

/** Live cards whose validity has run out. Feeds the expiry sweep. */
export interface ExpiredCardQuery {
  readonly asOf: Date;
  readonly limit: number;
}

/**
 * What a service is allowed to know about card persistence.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token, and so the in-memory implementation can be a genuine subclass that
 * cannot silently omit a method.
 */
export abstract class CardStore {
  abstract insert(card: NewCard, session?: ClientSession): Promise<CardRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<CardRecord | null>;

  /** Every card on an account, whatever its status. Used by the closure guard. */
  abstract listByAccount(accountId: string, session?: ClientSession): Promise<CardRecord[]>;

  /** A page of one customer's cards, newest first. */
  abstract list(query: CardQuery): Promise<{ records: CardRecord[] }>;

  /**
   * Applies a patch, optionally only from an expected status.
   *
   * Returns null when the guard did not match — the caller then knows the card moved
   * underneath it and can report the conflict rather than assume success.
   */
  abstract patch(input: CardPatchInput): Promise<CardRecord | null>;

  /** Clears the default flag on every other card of the account. */
  abstract clearDefault(input: {
    accountId: string;
    exceptCardId: string;
    session?: ClientSession;
  }): Promise<void>;

  /** Live cards past their expiry date, oldest first. */
  abstract listExpired(query: ExpiredCardQuery): Promise<CardRecord[]>;
}
