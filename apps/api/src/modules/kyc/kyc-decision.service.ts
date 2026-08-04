/**
 * Applying decisions to a case — the automated pass's and the analyst's alike.
 *
 * Both paths funnel through the same three outcomes (approve, reject, ask for more),
 * and approval is the only outcome that touches the customer record: the tier there is
 * what the limits read path consults, so it is written in the same breath as the case
 * decision. That is what "upgrading lifts limits immediately" reduces to in code —
 * one write, two records, no snapshot anywhere downstream.
 */

import { Injectable } from '@nestjs/common';

import { ErrorCode, KycStatus, type FieldError } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { UserRepository } from '../auth/users/index.js';

import { DECISION_REASONS, type AutoDecision } from './domain/auto-decision.js';
import { addMonthsUtc } from './domain/kyc-steps.js';
import { KycCaseRepository } from './kyc-case.repository.js';
import { type KycCaseDocument } from './kyc-case.schema.js';
import { REKYC_VALIDITY_MONTHS } from './kyc.constants.js';
import { type DecideKycRequest } from './kyc.dto.js';

/** Marker recorded as the decider when the automated pass decides. */
export const AUTOMATED_DECIDER = 'system:auto-review';

/** Statuses from which a human decision may land. */
const DECIDABLE_STATUSES: readonly string[] = Object.freeze([
  KycStatus.SUBMITTED,
  KycStatus.UNDER_REVIEW,
]);

@Injectable()
export class KycDecisionService {
  constructor(
    private readonly cases: KycCaseRepository,
    private readonly users: UserRepository,
    private readonly clock: ClockService,
  ) {}

  /**
   * Applies the automated pass's outcome to a freshly-submitted case.
   *
   * A REFER parks the case in the analyst queue (UNDER_REVIEW); APPROVE and REJECT
   * settle it outright. Either way the reason is recorded for the audit trail.
   */
  async applyAutoOutcome(caseId: string, outcome: AutoDecision): Promise<KycCaseDocument> {
    if (outcome.type === 'REFER') {
      return this.requirePatched(caseId, {
        $set: { status: KycStatus.UNDER_REVIEW, decisionReason: outcome.reason },
      });
    }
    if (outcome.type === 'APPROVE') {
      return this.applyApproval(caseId, outcome.tier, AUTOMATED_DECIDER, outcome.reason, null);
    }
    return this.applyRejection(caseId, outcome.reason, AUTOMATED_DECIDER);
  }

  /** What the customer is told when the automated pass declines, keyed by its reason. */
  private static readonly AUTO_REJECTION_MESSAGES: Readonly<Record<string, string>> = {
    [DECISION_REASONS.UNDERAGE]:
      'You must be at least 18 years old to open a Reliance Bank account.',
    [DECISION_REASONS.PROHIBITED_JURISDICTION]:
      'We are unable to offer an account based on the country information provided.',
  };

  /**
   * Applies an analyst's decision. Only a case waiting on a human may be decided.
   *
   * @throws {AppError} `CONFLICT` when the case is not under review; `VALIDATION_FAILED`
   *   when an approval grants more than the customer asked for.
   */
  async decideForAdmin(
    caseId: string,
    request: DecideKycRequest,
    adminId: string,
  ): Promise<KycCaseDocument> {
    const kycCase = await this.cases.findByCaseId(caseId);
    if (!kycCase) throw AppError.notFound('KYC case', caseId);
    if (!DECIDABLE_STATUSES.includes(kycCase.status)) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        `This case is ${kycCase.status.toLowerCase().replaceAll('_', ' ')} — only a case awaiting review can be decided.`,
      );
    }

    if (request.decision === 'APPROVE') {
      assertNotAboveRequested(request.tier, kycCase.requestedTier);
      return this.applyApproval(caseId, request.tier, adminId, 'analyst-approval', null);
    }
    if (request.decision === 'REJECT') {
      return this.applyRejection(caseId, request.reviewerMessage, adminId);
    }
    return this.requirePatched(caseId, {
      $set: { status: KycStatus.MORE_INFO_REQUIRED, reviewerMessage: request.reviewerMessage },
    });
  }

  /**
   * Grants a tier and writes it through to the customer record in the same breath.
   *
   * The approval carries an expiry: `REKYC_VALIDITY_MONTHS` from the decision, after
   * which the tier lapses until the customer re-verifies.
   */
  private async applyApproval(
    caseId: string,
    tier: number,
    decidedBy: string,
    reason: string,
    reviewerMessage: string | null,
  ): Promise<KycCaseDocument> {
    const now = this.clock.now();
    const updated = await this.requirePatched(caseId, {
      $set: {
        status: KycStatus.APPROVED,
        currentTier: tier,
        decidedAt: now,
        decidedBy,
        decisionReason: reason,
        reviewerMessage,
        expiresAt: addMonthsUtc(now, REKYC_VALIDITY_MONTHS),
      },
    });
    await this.users.patch(updated.userId, { $set: { kycTier: tier } });
    return updated;
  }

  /** Declines the case. The customer sees the reason; the tier does not move. */
  private async applyRejection(
    caseId: string,
    reason: string,
    decidedBy: string,
  ): Promise<KycCaseDocument> {
    const customerMessage = KycDecisionService.AUTO_REJECTION_MESSAGES[reason] ?? reason;
    return this.requirePatched(caseId, {
      $set: {
        status: KycStatus.REJECTED,
        decidedAt: this.clock.now(),
        decidedBy,
        decisionReason: reason,
        reviewerMessage: customerMessage,
      },
    });
  }

  /** Patches a case, treating a vanished row as the defect it is. */
  private async requirePatched(
    caseId: string,
    update: Parameters<KycCaseRepository['patch']>[1],
  ): Promise<KycCaseDocument> {
    const updated = await this.cases.patch(caseId, update);
    if (!updated) throw AppError.notFound('KYC case', caseId);
    return updated;
  }
}

/** An approval may grant less than requested, never more. */
function assertNotAboveRequested(tier: number, requestedTier: number): void {
  if (tier <= requestedTier) return;

  const details: FieldError[] = [
    {
      path: 'tier',
      message: `The customer asked for tier ${requestedTier}; you cannot approve above that.`,
    },
  ];
  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'An approval cannot grant a higher tier than the customer requested.',
    details,
  });
}
