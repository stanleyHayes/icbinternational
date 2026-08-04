import { ErrorCode } from '@reliance/contracts';

import type { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import type { IdGenerator } from '../../../common/ids/id-generator.js';
import { BusinessController } from '../business.controller.js';
import { BusinessStore, type BusinessApproval, type BusinessInvoice, type BusinessMember } from '../business.store.js';

describe('BusinessController', () => {
  function rig() {
    const store = new BusinessStore();
    const member: BusinessMember = {
      id: 'mem_1',
      userId: 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'OWNER',
      spendLimitAmount: '5000',
      spendLimitCurrency: 'GBP',
      addedAt: '2026-03-01T09:00:00.000Z',
    };
    const invoice: BusinessInvoice = {
      id: 'inv_1',
      reference: 'INV-100',
      counterpartyName: 'Northwind',
      dueDate: '2026-03-10',
      amount: '2500',
      currency: 'GBP',
      status: 'SENT',
      createdAt: '2026-03-01T09:00:00.000Z',
    };
    const approval: BusinessApproval = {
      id: 'apr_1',
      kind: 'PAYMENT',
      requestedById: 'usr_1',
      requestedByName: 'Ada',
      amount: '1500',
      currency: 'GBP',
      status: 'PENDING',
      createdAt: '2026-03-01T09:00:00.000Z',
      decidedAt: null,
      decidedById: null,
    };

    store.insertMember(member);
    store.insertInvoice(invoice);
    store.insertApproval(approval);

    const clock = {
      now: jest.fn(() => new Date('2026-03-01T09:00:00.000Z')),
    } as unknown as ClockService;
    const ids = {
      generate: jest.fn(() => 'pay_001'),
    } as unknown as IdGenerator;

    return { controller: new BusinessController(store, ids, clock), store };
  }

  it('lists and reads business entities through the in-memory store', () => {
    const { controller, store } = rig();

    expect(controller.listMembers()).toEqual({ data: store.listMembers() });
    expect(controller.getMember('mem_1')).toMatchObject({ id: 'mem_1' });
    expect(controller.listInvoices()).toEqual({ data: store.listInvoices() });
    expect(controller.getInvoice('inv_1')).toMatchObject({ id: 'inv_1' });
    expect(controller.listApprovals()).toEqual({ data: store.listApprovals() });
  });

  it('approves pending requests and rejects invalid or already-decided approvals', () => {
    const { controller } = rig();

    const approved = controller.decide('apr_1', { decision: 'APPROVE' }, { userId: 'usr_2' } as never);

    expect(approved.status).toBe('APPROVED');
    expect(approved.decidedById).toBe('usr_2');
    expect(approved.decidedAt).toBe('2026-03-01T09:00:00.000Z');

    expect(() =>
      controller.decide('apr_1', { decision: 'REJECT' }, { userId: 'usr_3' } as never),
    ).toThrow(AppError);

    expect(() =>
      controller.decide('missing', { decision: 'REJECT' }, { userId: 'usr_4' } as never),
    ).toThrow(expect.objectContaining({ code: ErrorCode.NOT_FOUND }));
  });

  it('creates payroll runs with defaults and stores them', () => {
    const { controller, store } = rig();

    const run = controller.createPayrollRun(
      { periodStart: '2026-02-01', periodEnd: '2026-02-28', employeeCount: 12, totalAmount: '2400', currency: 'GBP' },
      { userId: 'usr_9' } as never,
    );

    expect(run.status).toBe('SUBMITTED');
    expect(run.id).toBe('pay_001');
    expect(store.listPayrollRuns()).toContainEqual(run);
  });

  it('throws when a requested business entity cannot be found', () => {
    const { controller } = rig();

    expect(() => controller.getMember('missing')).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
    expect(() => controller.getInvoice('missing')).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
  });
});
