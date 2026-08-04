/**
 * Re-KYC expiry: an approval is not forever.
 *
 * Two ways in. `expireIfDue` is the lazy path — any read of a case or a tier passes
 * through it, so an approval lapses the first time anyone looks after its validity runs
 * out, whether or not a batch job ever runs. `sweepExpired` is the batch path, for the
 * operations console's scheduled runs: it retires everything overdue in one go so the
 * EXPIRED state shows up in the queue without waiting for the customer to come back.
 *
 * Either way the customer record's `kycTier` — the value the limits read path actually
 * consults — is dropped to 0 in the same breath, so a lapsed approval stops lifting
 * limits immediately, not eventually.
 */

import { Injectable, Logger } from '@nestjs/common';

import { KycStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { UserRepository } from '../auth/users/index.js';

import { KycCaseRepository } from './kyc-case.repository.js';
import { type KycCaseDocument } from './kyc-case.schema.js';
import { EXPIRY_SWEEP_BATCH } from './kyc.constants.js';

/** Tier a lapsed approval falls back to. */
const LAPSED_TIER = 0;

@Injectable()
export class KycExpiryService {
  private readonly logger = new Logger(KycExpiryService.name);

  constructor(
    private readonly cases: KycCaseRepository,
    private readonly users: UserRepository,
    private readonly clock: ClockService,
  ) {}

  /**
   * Retires `kycCase` when its validity has run out.
   *
   * @returns true when the case was expired by this call; the caller should re-read or
   *   use the returned flag rather than its stale copy.
   */
  async expireIfDue(kycCase: KycCaseDocument): Promise<boolean> {
    if (kycCase.status !== KycStatus.APPROVED) return false;
    if (!kycCase.expiresAt || kycCase.expiresAt.getTime() > this.clock.timestamp()) return false;

    await this.retire(kycCase);
    return true;
  }

  /**
   * Retires every approved case whose validity lapsed before `now`, in bounded batches.
   *
   * @returns how many cases were expired.
   */
  async sweepExpired(limit: number = EXPIRY_SWEEP_BATCH): Promise<number> {
    const overdue = await this.cases.findExpiredApproved(this.clock.now(), limit);
    for (const kycCase of overdue) await this.retire(kycCase);
    return overdue.length;
  }

  /** Marks the case EXPIRED and drops the customer's tier back to 0. */
  private async retire(kycCase: KycCaseDocument): Promise<void> {
    await this.cases.patch(kycCase.id, { $set: { status: KycStatus.EXPIRED } });
    await this.users.patch(kycCase.userId, { $set: { kycTier: LAPSED_TIER } });
    this.logger.log(`KYC case ${kycCase.id} expired; customer tier reset to ${LAPSED_TIER}`);
  }
}
