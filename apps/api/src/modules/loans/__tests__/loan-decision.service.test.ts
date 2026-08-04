import { ErrorCode, LoanKind } from '@reliance/contracts';

import type { ClockService } from '../../../common/clock/clock.service.js';
import { fromWire, toStored } from '../../../common/money/money.codec.js';
import { decide } from '../decision-engine.js';
import { assessEligibility } from '../eligibility.js';
import type { LoanApplicationRecord } from '../loan-application.store.js';
import { LoanDecisionService } from '../loan-decision.service.js';
import { LoanApplicationStatus } from '../loan.types.js';

jest.mock('../eligibility.js', () => ({
  assessEligibility: jest.fn(() => ({
    creditScore: 700,
    debtToIncomeBps: 1200,
    indicativeAprBps: 550,
  })),
}));

jest.mock('../decision-engine.js', () => ({
  LoanDecision: {
    APPROVE: 'APPROVE',
    DECLINE: 'DECLINE',
    REFER: 'REFER',
  },
  decide: jest.fn(() => ({ decision: 'APPROVE', approvedAmount: { amount: '100000', currency: 'GBP' }, reasons: [] })),
}));

describe('LoanDecisionService', () => {
  function rig() {
    const product = {
      code: 'PERSONAL_LOAN',
      name: 'Personal Loan',
      kind: LoanKind.PERSONAL,
      currency: 'GBP',
      minAmount: { amount: '100000', currency: 'GBP' },
      maxAmount: { amount: '2500000', currency: 'GBP' },
      minTermMonths: 12,
      maxTermMonths: 84,
      representativeAprBps: 899,
      minAprBps: 599,
      maxAprBps: 2499,
      arrangementFee: { amount: '0', currency: 'GBP' },
      earlyRepaymentFeeBps: 0,
      minKycTier: 2,
      description: 'Personal loan',
    };

    const record: LoanApplicationRecord = {
      id: 'app_001',
      userId: 'user_001',
      productCode: product.code,
      status: LoanApplicationStatus.SUBMITTED,
      requestedAmount: toStored(fromWire({ amount: '100000', currency: 'GBP' })),
      termMonths: 24,
      purpose: 'Car repair',
      disbursementAccountId: 'acc_001',
      declaredMonthlyIncome: toStored(fromWire({ amount: '400000', currency: 'GBP' })),
      declaredMonthlyDebtPayments: toStored(fromWire({ amount: '100000', currency: 'GBP' })),
      declaredEmploymentMonths: 24,
      offer: null,
      offerExpiresAt: null,
      declineReasons: [],
      requiredDocumentKinds: ['PAYSLIP'],
      suppliedDocumentKinds: [],
      creditScore: null,
      debtToIncomeBps: null,
      submittedAt: new Date('2026-03-01T09:00:00.000Z'),
      decidedAt: null,
      acceptedAt: null,
      createdAt: new Date('2026-03-01T09:00:00.000Z'),
      loanId: null,
    };

    let current = { ...record };
    const applications: {
      findById: jest.Mock;
      patch: jest.Mock;
    } = {
      findById: jest.fn(async (id: string) => (id === record.id ? { ...record } : null)),
      patch: jest.fn(async (_id: string, fields: Record<string, unknown>) => {
        current = { ...current, ...fields };
        return current;
      }),
    };

    const quotes: {
      requireProduct: jest.Mock;
      quote: jest.Mock;
      priceFor: jest.Mock;
    } = {
      requireProduct: jest.fn(() => product),
      quote: jest.fn(() => ({ amount: '100000', currency: 'GBP', repaymentSchedule: [] })),
      priceFor: jest.fn(() => 799),
    };

    const profiles: {
      build: jest.Mock;
    } = {
      build: jest.fn(async () => ({ score: 700, debtToIncomeBps: 1200 })),
    };

    const clock = {
      today: jest.fn(() => '2026-03-01'),
      now: jest.fn(() => new Date('2026-03-01T09:00:00.000Z')),
    } as unknown as ClockService;

    const service = new LoanDecisionService(applications as never, quotes as never, profiles as never, clock);

    return { service, applications, quotes, profiles, record, product };
  }

  it('evaluates an application and builds an offer', async () => {
    const { service, record } = rig();

    const updated = await service.evaluate(record);
    expect(updated.status).toBe(LoanApplicationStatus.OFFER_MADE);
    expect(updated.creditScore).toBe(700);
    expect(updated.debtToIncomeBps).toBe(1200);
    expect(assessEligibility).toHaveBeenCalled();
    expect(decide).toHaveBeenCalled();
  });

  it('declines and approves manually decided applications', async () => {
    const { service, applications, record } = rig();

    const declined = await service.decideManually({
      applicationId: record.id,
      request: { decision: 'DECLINE', reasons: ['Income missing'] },
    } as never);

    expect(declined.status).toBe(LoanApplicationStatus.DECLINED);
    expect(declined.declineReasons).toEqual(['Income missing']);

    (applications.patch as jest.Mock).mockResolvedValueOnce({
      ...record,
      status: LoanApplicationStatus.OFFER_MADE,
      offer: { amount: '100000', currency: 'GBP', repaymentSchedule: [] },
      offerExpiresAt: new Date('2026-03-10T23:59:59.000Z'),
      decidedAt: new Date('2026-03-01T09:00:00.000Z'),
      declineReasons: [],
    });

    const approved = await service.decideManually({
      applicationId: record.id,
      request: { decision: 'APPROVE', approvedAmount: { amount: '100000', currency: 'GBP' } },
    } as never);

    expect(approved.status).toBe(LoanApplicationStatus.OFFER_MADE);
    expect(approved.offer).toBeTruthy();
  });

  it('requires an application before manual decisions', async () => {
    const { service, applications, record } = rig();
    (applications.findById as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.decideManually({ applicationId: record.id, request: { decision: 'APPROVE' } } as never)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
