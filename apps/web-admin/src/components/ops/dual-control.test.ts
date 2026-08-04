import { ApprovalStatus, type ApprovalRequest } from '@reliance/contracts';

import { blockedReasonFor, isInitiator } from './dual-control';

const NOW = Date.parse('2026-08-03T12:00:00Z');
const INITIATOR = 'adm_01J8ZQ4T7M5N6P7Q8R9S0T1U2V';
const APPROVER = 'adm_01J8ZQ4T7M5N6P7Q8R9S0T1U3W';

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'apr_1',
    kind: 'MANUAL_POSTING',
    status: ApprovalStatus.PENDING,
    initiatedBy: { id: INITIATOR, name: 'Amara Boateng' },
    decidedBy: null,
    payload: {},
    amount: { amount: '430000', currency: 'GBP' },
    justification: 'Correcting a mis-posted salary credit.',
    decisionNote: null,
    expiresAt: '2026-08-04T12:00:00Z',
    createdAt: '2026-08-03T09:00:00Z',
    decidedAt: null,
    ...overrides,
  };
}

describe('blockedReasonFor', () => {
  it('allows a different operator who holds the approval permission', () => {
    const reason = blockedReasonFor({
      request: request(),
      operatorId: APPROVER,
      canApprove: true,
      nowMs: NOW,
    });

    expect(reason).toBeNull();
  });

  it('refuses the operator who raised the request', () => {
    const reason = blockedReasonFor({
      request: request(),
      operatorId: INITIATOR,
      canApprove: true,
      nowMs: NOW,
    });

    expect(reason).toContain('You raised this request');
  });

  it('refuses an operator whose role does not allow approvals', () => {
    const reason = blockedReasonFor({
      request: request(),
      operatorId: APPROVER,
      canApprove: false,
      nowMs: NOW,
    });

    expect(reason).toContain('does not allow approvals');
  });

  it('refuses a request that has already been decided', () => {
    const reason = blockedReasonFor({
      request: request({ status: ApprovalStatus.APPROVED }),
      operatorId: APPROVER,
      canApprove: true,
      nowMs: NOW,
    });

    expect(reason).toContain('already been decided');
  });

  it('refuses a request that has lapsed', () => {
    const reason = blockedReasonFor({
      request: request({ expiresAt: '2026-08-03T11:00:00Z' }),
      operatorId: APPROVER,
      canApprove: true,
      nowMs: NOW,
    });

    expect(reason).toContain('lapsed');
  });

  it('states the decided reason before the self-approval one, so a closed request reads correctly', () => {
    const reason = blockedReasonFor({
      request: request({ status: ApprovalStatus.REJECTED }),
      operatorId: INITIATOR,
      canApprove: true,
      nowMs: NOW,
    });

    expect(reason).toContain('already been decided');
  });
});

describe('isInitiator', () => {
  it('is true only for the operator who raised the request', () => {
    expect(isInitiator(request(), INITIATOR)).toBe(true);
    expect(isInitiator(request(), APPROVER)).toBe(false);
    expect(isInitiator(request(), null)).toBe(false);
  });
});
