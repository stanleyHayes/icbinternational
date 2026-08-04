import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ClockService } from '../../../common/clock/clock.service.js';
import { PasswordService } from '../../auth/password.service.js';
import { MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MINUTES } from '../card.constants.js';
import { cardChangedUnderneath, pinIncorrect, pinLocked } from '../card.errors.js';
import { CardStore, type CardRecord } from '../card.store.js';

/**
 * The card PIN: set, changed, verified — never read.
 *
 * Stored as an Argon2 digest, exactly as a password is. A four-digit PIN has ten thousand
 * possibilities, so the hash is not what makes it safe on its own; the attempt counter is.
 * Three wrong tries and the card stops accepting a PIN for an hour, which turns an
 * exhaustive search from four seconds of work into four years of it.
 *
 * **Nothing here returns or logs a PIN.** The service exposes `verify` and `set`, and
 * there is deliberately no `get`: a value support could be talked into reading aloud is a
 * value that will eventually be read aloud.
 */
@Injectable()
export class CardPinService {
  private readonly logger = new Logger(CardPinService.name);

  constructor(
    private readonly cards: CardStore,
    private readonly passwords: PasswordService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Sets or replaces the card's PIN and clears any lockout.
   *
   * Changing the PIN is the documented way out of a lockout. A customer who has forgotten
   * their PIN needs a route that does not involve waiting an hour or visiting a branch,
   * and they have already passed step-up to reach this endpoint.
   */
  async set(input: {
    card: CardRecord;
    pin: string;
    session?: ClientSession;
  }): Promise<CardRecord> {
    const pinHash = await this.passwords.hash(input.pin);

    const patched = await this.cards.patch({
      cardId: input.card.id,
      fields: { pinHash, pinAttempts: 0, pinLockedUntil: null },
      ...(input.session ? { session: input.session } : {}),
    });

    if (!patched) throw cardChangedUnderneath(input.card.id);

    this.logger.log(`PIN set on card ${input.card.id}`);
    return patched;
  }

  /**
   * Checks a PIN, counting the failure if it is wrong.
   *
   * @returns True when the PIN matches. False is never returned — a wrong PIN throws, so
   *   no caller can forget to handle it and treat a failure as a pass.
   * @throws {AppError} `PIN_TRIES_EXCEEDED` while the card is locked; `PIN_INCORRECT`
   *   otherwise, carrying how many tries are left.
   */
  async verify(card: CardRecord, pin: string): Promise<boolean> {
    this.assertNotLocked(card);

    const matches = card.pinHash ? await this.passwords.verify(card.pinHash, pin) : false;
    if (matches) {
      await this.resetAttempts(card);
      return true;
    }

    throw await this.recordFailure(card);
  }

  /**
   * Whether a PIN entered at a terminal is right, without throwing.
   *
   * The authorisation path needs a decline reason rather than an exception: a wrong PIN at
   * a till is a normal outcome that the terminal has to be told about in scheme codes, not
   * an error the API surfaces. The attempt is still counted.
   */
  async matches(card: CardRecord, pin: string): Promise<boolean> {
    if (this.isLocked(card)) return false;

    const ok = card.pinHash ? await this.passwords.verify(card.pinHash, pin) : false;
    if (ok) {
      await this.resetAttempts(card);
      return true;
    }

    await this.applyFailure(card);
    return false;
  }

  /** Whether the card is currently refusing PIN entry. */
  isLocked(card: CardRecord): boolean {
    return card.pinLockedUntil !== null && card.pinLockedUntil.getTime() > this.clock.timestamp();
  }

  private assertNotLocked(card: CardRecord): void {
    if (card.pinLockedUntil && this.isLocked(card)) throw pinLocked(card.id, card.pinLockedUntil);
  }

  private async resetAttempts(card: CardRecord): Promise<void> {
    if (card.pinAttempts === 0 && card.pinLockedUntil === null) return;
    await this.cards.patch({
      cardId: card.id,
      fields: { pinAttempts: 0, pinLockedUntil: null },
    });
  }

  /** Increments the counter and locks the card once the allowance is spent. */
  private async applyFailure(card: CardRecord): Promise<number> {
    const attempts = card.pinAttempts + 1;
    const exhausted = attempts >= MAX_PIN_ATTEMPTS;

    await this.cards.patch({
      cardId: card.id,
      fields: {
        pinAttempts: exhausted ? 0 : attempts,
        pinLockedUntil: exhausted ? this.clock.inMinutes(PIN_LOCKOUT_MINUTES) : null,
      },
    });

    if (exhausted) this.logger.warn(`Card ${card.id} locked after ${MAX_PIN_ATTEMPTS} wrong PINs`);
    return exhausted ? 0 : MAX_PIN_ATTEMPTS - attempts;
  }

  private async recordFailure(card: CardRecord) {
    const remaining = await this.applyFailure(card);
    return remaining === 0
      ? pinLocked(card.id, this.clock.inMinutes(PIN_LOCKOUT_MINUTES))
      : pinIncorrect(card.id, remaining);
  }
}
