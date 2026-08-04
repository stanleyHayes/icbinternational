import { ErrorCode } from '@reliance/contracts';

import type { ClockService } from '../../../common/clock/clock.service.js';
import { fromWire, toStored } from '../../../common/money/money.codec.js';
import { LoanApplicationService } from '../loan-application.service.js';
import type { LoanApplicationRecord } from '../loan-application.store.js';
import type { LoanDecisionService } from '../loan-decision.service.js';
import { findLoanProduct } from '../loan-products.catalogue.js';
import type { LoanQuoteService } from '../loan-quote.service.js';
import { LoanApplicationStatus } from '../loan.types.js';

describe('LoanApplicationService', () => {
  function rig() {
    const product = findLoanProduct('PERSONAL_LOAN');
    if (!product) throw new Error('PERSONAL_LOAN product not found');

    const baseRecord: LoanApplicationRecord = {
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

    const store: {
      insert: jest.Mock;
      findById: jest.Mock;
      list: jest.Mock;
      patch: jest.Mock;
      claim: jest.Mock;
      listExpiredOffers: jest.Mock;
    } = {
      insert: jest.fn(async (input) => ({ ...baseRecord, ...input, id: 'app_002', createdAt: new Date('2026-03-01T09:00:00.000Z') })),
      findById: jest.fn(async (id: string) => (id === baseRecord.id ? baseRecord : null)),
      list: jest.fn(async () => [baseRecord]),
      patch: jest.fn(async (_id: string, fields: Record<string, unknown>) => ({ ...baseRecord, ...fields })),
      claim: jest.fn(),
      listExpiredOffers: jest.fn(async () => [baseRecord]),
    };

    const quotes = {
      requireProduct: jest.fn(() => product),
      assertWithinProduct: jest.fn(),
      quote: jest.fn(() => ({ amount: '100000', currency: 'GBP', repaymentSchedule: [] })),
      priceFor: jest.fn(() => 799),
    } as unknown as LoanQuoteService;

    const decisions = {
      evaluate: jest.fn(async (record) => ({ ...record, status: LoanApplicationStatus.OFFER_MADE })),
    } as unknown as LoanDecisionService;

    const clock = {
      now: jest.fn(() => new Date('2026-03-02T10:00:00.000Z')),
    } as unknown as ClockService;

    const service = new LoanApplicationService(store as never, quotes as never, decisions as never, clock);

    return { service, store, quotes, decisions, product, baseRecord };
  }

  it('creates and reads applications, then re-evaluates documents and withdrawals', async () => {
    const { service, decisions, store, baseRecord } = rig();

    const application = await service.create('user_001', {
      productCode: 'PERSONAL_LOAN',
      amount: { amount: '100000', currency: 'GBP' },
      termMonths: 24,
      purpose: 'Car repair',
      disbursementAccountId: 'acc_001',
      monthlyIncome: { amount: '400000', currency: 'GBP' },
      monthlyDebtPayments: { amount: '100000', currency: 'GBP' },
      employmentMonths: 24,
    } as never);

    expect(application.status).toBe('OFFER_MADE');
    expect(decisions.evaluate).toHaveBeenCalled();

    const listed = await service.list('user_001');
    expect(listed).toHaveLength(1);

    const fetched = await service.get('user_001', baseRecord.id);
    expect(fetched.id).toBe(baseRecord.id);

    const updated = await service.submitDocuments({
      userId: 'user_001',
      applicationId: baseRecord.id,
      request: { documentKinds: ['BANK_STATEMENT'] },
    } as never);
    expect(updated.status).toBe(LoanApplicationStatus.OFFER_MADE);

    const withdrawn = await service.withdraw('user_001', baseRecord.id);
    expect(withdrawn.status).toBe(LoanApplicationStatus.WITHDRAWN);
    expect(store.patch).toHaveBeenCalled();
  });

  it('expires stale offers and refuses access to foreign applications', async () => {
    const { service, baseRecord } = rig();

    const expired = await service.expireStaleOffers(10);
    expect(expired).toBe(1);

    await expect(service.require('other_user', baseRecord.id)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });

    await expect(service.get('other_user', baseRecord.id)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('lists referred applications in chronological order', async () => {
    const { service, store } = rig();
    const older = {
      id: 'app_older',
      userId: 'user_001',
      productCode: 'PERSONAL_LOAN',
      status: LoanApplicationStatus.REFERRED,
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
      submittedAt: new Date('2026-02-01T09:00:00.000Z'),
      decidedAt: null,
      acceptedAt: null,
      createdAt: new Date('2026-02-01T09:00:00.000Z'),
      loanId: null,
    };
    const newer = {
      ...older,
      id: 'app_newer',
      createdAt: new Date('2026-03-01T09:00:00.000Z'),
      submittedAt: new Date('2026-03-01T09:00:00.000Z'),
    };
    (store.list as jest.Mock).mockResolvedValue([newer, older]);

    const list = await service.listReferred();
    expect(list.map((row) => row.id)).toEqual(['app_older', 'app_newer']);
  });
});
