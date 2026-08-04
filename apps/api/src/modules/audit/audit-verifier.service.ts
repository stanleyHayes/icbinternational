import { Injectable, Logger } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';

import { verifyAuditChain } from './audit-chain.verifier.js';
import { AuditEventRepository } from './audit-event.repository.js';
import { type AuditChainVerification } from './audit.types.js';

/**
 * The injectable face of chain verification.
 *
 * The walk itself is a pure function in `audit-chain.verifier.ts`; this class only wires
 * it to the repository and the clock. Keeping them apart is what lets the tamper-detection
 * tests run the real algorithm against a handful of in-memory events instead of needing a
 * MongoDB replica set to prove that editing a record is noticed.
 *
 * Verification reads every event ever written. Run it from `pnpm audit:verify`, the
 * nightly job or the guarded admin endpoint — never on a customer request path.
 */
@Injectable()
export class AuditVerifierService {
  private readonly logger = new Logger(AuditVerifierService.name);

  constructor(
    private readonly events: AuditEventRepository,
    private readonly clock: ClockService,
  ) {}

  /** Walks the chain from the genesis anchor and reports the first broken link. */
  async verify(): Promise<AuditChainVerification> {
    const report = await verifyAuditChain(
      (fromSequence, limit) => this.events.findFromSequence(fromSequence, limit),
      this.clock.now().toISOString(),
    );

    if (report.verified) {
      this.logger.log(`Audit chain verified: ${report.eventsChecked} events, no breaks`);
      return report;
    }

    // Logged at error level unconditionally: a broken chain is a security incident even
    // when the caller only wanted a status code.
    this.logger.error(
      `Audit chain BROKEN at sequence ${report.firstBrokenSequence}: ${report.reason}`,
    );
    return report;
  }
}
