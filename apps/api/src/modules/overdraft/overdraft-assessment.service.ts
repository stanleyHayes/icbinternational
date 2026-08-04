/**
 * Sizing a facility: the scorecard, the income, and the ceiling.
 *
 * A separate injectable because "how large a facility" is a policy question that belongs
 * next to the pricing rather than next to the state machine, and because `OverdraftService`
 * has no room left in its constructor.
 *
 * A separate *file* because `OverdraftService` names this class as a constructor parameter
 * and Nest emits that reference into `design:paramtypes` at the point the decorator runs.
 * Declared below the service in the same module, that reference is in its temporal dead
 * zone and the file throws on import — which is a class of failure nothing catches until
 * something imports the service directly.
 */

import { Injectable } from '@nestjs/common';

import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromWire } from '../../common/money/money.codec.js';
import { CreditProfileService, creditScoreFor } from '../loans/index.js';

import { assignableLimit } from './overdraft-pricing.js';
import { type RequestOverdraftRequest } from './overdraft.dto.js';

@Injectable()
export class OverdraftAssessment {
  constructor(
    private readonly profiles: CreditProfileService,
    readonly clock: ClockService,
  ) {}

  /** What the bank will grant against this request. Zero means declined. */
  async sizeFor(userId: string, request: RequestOverdraftRequest): Promise<Money> {
    const profile = await this.profiles.build(userId, {
      monthlyIncome: fromWire(request.monthlyIncome),
      monthlyDebtPayments: fromWire(request.monthlyDebtPayments),
      employmentMonths: request.employmentMonths,
    });

    return assignableLimit({
      monthlyIncome: profile.monthlyIncome,
      creditScore: creditScoreFor(profile),
      requested: fromWire(request.requestedLimit),
    });
  }
}
