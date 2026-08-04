import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ClockService } from '../../../common/clock/clock.service.js';
import { type SpendWindows } from '../controls/spend-limits.js';

import { AuthorisationStore } from './authorisation.store.js';

/**
 * How much of each ceiling a card has already used.
 *
 * Three reads, deliberately not one. A daily and a monthly window overlap, so a single
 * query returning the month and filtering in memory would be cheaper — and would also
 * pull a month of a heavy spender's authorisations into the authorisation path, on the
 * hot route, to answer a question about today. The indexes make three bounded reads the
 * cheaper shape in practice as well as the clearer one.
 *
 * Windows are measured on the **simulated** clock. An operator who advances the business
 * date by a day expects yesterday's spend to fall out of the daily limit, and it does.
 */
@Injectable()
export class SpendWindowReader {
  constructor(
    private readonly authorisations: AuthorisationStore,
    private readonly clock: ClockService,
  ) {}

  /** Everything a limit check needs to know about a card's recent spend. */
  async read(cardId: string, session?: ClientSession): Promise<SpendWindows> {
    const dayStart = this.clock.startOfDay();
    const monthStart = startOfMonth(this.clock.now());

    const [today, thisMonth, atmToday] = await Promise.all([
      this.authorisations.listInWindow({ cardId, from: dayStart, ...sessionOf(session) }),
      this.authorisations.listInWindow({ cardId, from: monthStart, ...sessionOf(session) }),
      this.authorisations.listInWindow({
        cardId,
        from: dayStart,
        channel: 'ATM',
        ...sessionOf(session),
      }),
    ]);

    return { today, thisMonth, atmToday };
  }
}

/** Midnight UTC on the first of the month the instant falls in. */
export function startOfMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

function sessionOf(session?: ClientSession) {
  return session ? { session } : {};
}
