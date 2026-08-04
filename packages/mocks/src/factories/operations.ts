/**
 * Operations fixtures: staff, audit, AML, approvals, flags and reports.
 *
 * The audit chain is genuinely chained — each event's `previousHash` is the previous
 * event's `hash`. `verifyAuditChain` in the admin console is only meaningful against
 * data where that holds, and a mock that filled both fields with noise would make the
 * verify button pass or fail at random.
 */

import type {
  AdminRoleDefinition,
  CommsCampaign,
  CommsTemplate,
  FraudRule,
  JobRun,
  ScreeningHit,
} from '@reliance/api-client';
import {
  AdminRole,
  AlertSeverity,
  AlertStatus,
  AmlRuleKind,
  ApprovalStatus,
  Permission,
  type AdminUser,
  type AmlAlert,
  type AmlCase,
  type AmlRule,
  type ApprovalRequest,
  type AuditEvent,
  type FeatureFlag,
  type Snapshot,
} from '@reliance/contracts';

import type { MockClock } from '../db/clock.js';
import { money } from '../db/money.js';
import { faker, mockId, opaqueId, pickOne, times } from '../faker.js';

import type { FactoryOptions } from './identity.js';

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [AdminRole.SUPER_ADMIN]: Object.values(Permission),
  [AdminRole.COMPLIANCE_OFFICER]: [
    Permission.CUSTOMER_READ,
    Permission.KYC_READ,
    Permission.KYC_DECIDE,
    Permission.AML_READ,
    Permission.AML_DECIDE,
    Permission.AML_RULE_WRITE,
    Permission.AUDIT_READ,
  ],
  [AdminRole.SUPPORT_AGENT]: [
    Permission.CUSTOMER_READ,
    Permission.TICKET_MANAGE,
    Permission.CARD_MANAGE,
  ],
  [AdminRole.AUDITOR]: [Permission.AUDIT_READ, Permission.REPORT_READ, Permission.CUSTOMER_READ],
};

/** A staff account. */
export function makeAdminUser(
  options: FactoryOptions<AdminUser> & { role?: AdminRole },
): AdminUser {
  const { clock, overrides } = options;
  const role = options.role ?? AdminRole.SUPPORT_AGENT;

  return {
    id: mockId('adm'),
    email: faker.internet.email({ provider: 'reliance.test' }).toLowerCase(),
    fullName: faker.person.fullName(),
    roles: [role],
    permissions: ROLE_PERMISSIONS[role] ?? [Permission.CUSTOMER_READ],
    active: true,
    mfaEnrolled: true,
    ipAllowlist: [],
    lastLoginAt: clock.daysAgo(faker.number.int({ min: 0, max: 5 })),
    createdAt: clock.daysAgo(faker.number.int({ min: 100, max: 900 })),
    ...overrides,
  };
}

/** The role catalogue. */
export function makeAdminRoles(): AdminRoleDefinition[] {
  return Object.values(AdminRole).map((role) => ({
    role,
    label: role.replaceAll('_', ' ').toLowerCase(),
    description: `Standard ${role.replaceAll('_', ' ').toLowerCase()} permission bundle.`,
    permissions: ROLE_PERMISSIONS[role] ?? [Permission.CUSTOMER_READ],
    memberCount: faker.number.int({ min: 1, max: 12 }),
    system: true,
  }));
}

/**
 * An audit trail whose hash chain actually links.
 *
 * The "hash" is a cheap deterministic digest rather than SHA-256: nothing here is a
 * security control, and what the console needs is a chain whose links are checkable and
 * reproducible from a seed.
 */
export function makeAuditTrail(options: { clock: MockClock; count: number }): AuditEvent[] {
  const { clock, count } = options;
  const events: AuditEvent[] = [];
  let previousHash = 'genesis';

  for (let index = 0; index < count; index += 1) {
    const action = pickOne(['customer.read', 'kyc.decide', 'posting.initiate', 'flag.write']);
    const entity = pickOne(['User', 'KycCase', 'JournalEntry', 'FeatureFlag']);
    const entityId = opaqueId();
    const at = clock.daysAgo(count - index);
    const hash = digest(`${previousHash}:${index}:${action}:${entityId}:${at}`);

    events.push({
      id: mockId('aud'),
      sequence: index + 1,
      actorType: 'ADMIN',
      actorId: mockId('adm'),
      actorName: faker.person.fullName(),
      action,
      entity,
      entityId,
      changes: [{ field: 'status', before: 'PENDING', after: 'APPROVED' }],
      ipAddress: faker.internet.ipv4(),
      userAgent: 'Reliance Console',
      traceId: opaqueId(),
      previousHash,
      hash,
      at,
    });

    previousHash = hash;
  }

  return events;
}

const DIGEST_RADIX = 36;
const DIGEST_SHIFT = 5;

function digest(input: string): string {
  let accumulator = 0;
  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;
    accumulator = Math.trunc((accumulator << DIGEST_SHIFT) - accumulator + code);
  }
  return Math.abs(accumulator).toString(DIGEST_RADIX).padStart(12, '0');
}

/** A dual-control approval request. */
export function makeApprovalRequest(options: FactoryOptions<ApprovalRequest>): ApprovalRequest {
  const { clock, overrides } = options;

  return {
    id: opaqueId(),
    kind: 'MANUAL_POSTING',
    status: ApprovalStatus.PENDING,
    initiatedBy: { id: mockId('adm'), name: faker.person.fullName() },
    decidedBy: null,
    payload: { accountId: mockId('acc'), direction: 'CREDIT' },
    amount: money(faker.number.int({ min: 1_000, max: 500_000 })),
    justification: 'Goodwill credit agreed with the customer following a service failure.',
    decisionNote: null,
    expiresAt: clock.daysAhead(2),
    createdAt: clock.daysAgo(1),
    decidedAt: null,
    ...overrides,
  };
}

/** AML rules with plausible tuning. */
export function makeAmlRules(clock: MockClock): AmlRule[] {
  const SEED: readonly { kind: AmlRuleKind; name: string; parameters: AmlRule['parameters'] }[] = [
    {
      kind: AmlRuleKind.VELOCITY,
      name: 'High payment velocity',
      parameters: { windowHours: 24, count: 12 },
    },
    {
      kind: AmlRuleKind.STRUCTURING,
      name: 'Structuring below reporting threshold',
      parameters: { windowDays: 7, amount: '990000', count: 3 },
    },
    {
      kind: AmlRuleKind.HIGH_RISK_CORRIDOR,
      name: 'Payment to high-risk corridor',
      parameters: { countries: 'IR,KP,SY' },
    },
    {
      kind: AmlRuleKind.DORMANT_REACTIVATION,
      name: 'Dormant account reactivated',
      parameters: { dormantDays: 365, amount: '500000' },
    },
  ];

  return SEED.map((entry) => ({
    id: opaqueId(),
    kind: entry.kind,
    name: entry.name,
    description: `Fires when ${entry.name.toLowerCase()} is detected on a customer's activity.`,
    enabled: true,
    severity: AlertSeverity.MEDIUM,
    parameters: entry.parameters,
    alertsLast30Days: faker.number.int({ min: 2, max: 140 }),
    falsePositiveRateBps: faker.number.int({ min: 200, max: 6_000 }),
    updatedAt: clock.daysAgo(faker.number.int({ min: 3, max: 90 })),
  }));
}

/** Fraud rules. */
export function makeFraudRules(clock: MockClock): FraudRule[] {
  const SEED: readonly { name: string; action: FraudRule['action'] }[] = [
    { name: 'Impossible travel', action: 'CHALLENGE' },
    { name: 'New payee, large amount', action: 'REVIEW' },
    { name: 'Card testing pattern', action: 'BLOCK' },
    { name: 'Device change during payment', action: 'SCORE_ONLY' },
  ];

  return SEED.map((entry) => ({
    id: opaqueId(),
    name: entry.name,
    description: `Detects ${entry.name.toLowerCase()} across the payment and card channels.`,
    enabled: true,
    action: entry.action,
    severity: 'HIGH',
    parameters: { thresholdMinutes: 90, amount: '150000' },
    triggersLast30Days: faker.number.int({ min: 0, max: 90 }),
    falsePositiveRateBps: faker.number.int({ min: 100, max: 4_000 }),
    updatedAt: clock.daysAgo(faker.number.int({ min: 1, max: 60 })),
  }));
}

/** An AML alert. */
export function makeAmlAlert(
  options: FactoryOptions<AmlAlert> & { rule: AmlRule; userId: string; customerName: string },
): AmlAlert {
  const { clock, customerName, overrides, rule, userId } = options;

  return {
    id: mockId('alt'),
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    status: AlertStatus.OPEN,
    userId,
    customerName,
    score: faker.number.int({ min: 30, max: 95 }),
    summary: `${rule.name} triggered on recent activity for this customer.`,
    relatedTransactionIds: times(2, () => mockId('txn')),
    assignedToId: null,
    caseId: null,
    raisedAt: clock.daysAgo(faker.number.int({ min: 0, max: 14 })),
    slaDueAt: clock.daysAhead(3),
    closedAt: null,
    ...overrides,
  };
}

/** An investigation case. */
export function makeAmlCase(
  options: FactoryOptions<AmlCase> & { userId: string; customerName: string; alertIds: string[] },
): AmlCase {
  const { alertIds, clock, customerName, overrides, userId } = options;

  return {
    id: mockId('cse'),
    reference: `CASE-${faker.string.numeric(6)}`,
    status: 'INVESTIGATING',
    userId,
    customerName,
    alertIds,
    severity: AlertSeverity.MEDIUM,
    assignedToId: mockId('adm'),
    notes: [
      {
        authorName: faker.person.fullName(),
        body: 'Reviewed the last ninety days of activity. Pattern is consistent with salary and rent.',
        at: clock.daysAgo(2),
      },
    ],
    evidenceIds: [],
    disposition: null,
    suspiciousActivityReportFiled: false,
    openedAt: clock.daysAgo(5),
    closedAt: null,
    ...overrides,
  };
}

/** A screening hit. */
export function makeScreeningHit(
  options: FactoryOptions<ScreeningHit> & { userId: string; customerName: string },
): ScreeningHit {
  const { clock, customerName, overrides, userId } = options;

  return {
    id: opaqueId(),
    userId,
    customerName,
    listName: pickOne(['UK HMT Consolidated List', 'OFAC SDN', 'EU Consolidated List']),
    matchedName: customerName,
    matchScore: faker.number.int({ min: 60, max: 98 }),
    matchType: pickOne(['SANCTIONS', 'PEP', 'ADVERSE_MEDIA'] as const),
    status: 'OPEN',
    assignedToId: null,
    detail: 'Fuzzy name match requires manual adjudication before the account can transact.',
    screenedAt: clock.daysAgo(faker.number.int({ min: 0, max: 10 })),
    decidedAt: null,
    ...overrides,
  };
}

/** Messaging templates. */
export function makeCommsTemplates(clock: MockClock): CommsTemplate[] {
  const SEED: readonly { key: string; name: string; channel: CommsTemplate['channel'] }[] = [
    { key: 'auth.verify-email', name: 'Verify your email', channel: 'EMAIL' },
    { key: 'payment.sent', name: 'Payment sent', channel: 'PUSH' },
    { key: 'card.frozen', name: 'Card frozen', channel: 'SMS' },
    { key: 'statement.ready', name: 'Statement ready', channel: 'EMAIL' },
  ];

  return SEED.map((entry) => ({
    id: opaqueId(),
    key: entry.key,
    channel: entry.channel,
    name: entry.name,
    subject: entry.channel === 'EMAIL' ? entry.name : null,
    body: `Hello {{firstName}}, ${entry.name.toLowerCase()}.`,
    variables: ['firstName'],
    locale: 'en-GB',
    status: 'PUBLISHED',
    updatedAt: clock.daysAgo(faker.number.int({ min: 5, max: 200 })),
  }));
}

/** Campaign sends. */
export function makeCommsCampaigns(options: {
  clock: MockClock;
  templateIds: readonly string[];
  count: number;
}): CommsCampaign[] {
  const { clock, count, templateIds } = options;

  return times(count, (index) => {
    const audienceSize = faker.number.int({ min: 500, max: 40_000 });
    const sentCount = Math.floor(audienceSize * 0.98);

    return {
      id: opaqueId(),
      name: `${pickOne(['Summer', 'Autumn', 'Winter'])} savings push ${index + 1}`,
      templateId: templateIds[index % Math.max(templateIds.length, 1)] ?? opaqueId(),
      status: 'SENT',
      segment: pickOne(['Active savers', 'Dormant 90d', 'New joiners']),
      audienceSize,
      sentCount,
      openCount: Math.floor(sentCount * 0.42),
      clickCount: Math.floor(sentCount * 0.11),
      scheduledFor: clock.daysAgo(index + 2),
      sentAt: clock.daysAgo(index + 2),
      createdAt: clock.daysAgo(index + 5),
    };
  });
}

/** Background job runs, including a failure so the dead-letter screen has content. */
export function makeJobRuns(options: { clock: MockClock; count: number }): JobRun[] {
  const { clock, count } = options;
  const NAMES = ['accrue-interest', 'settle-card-batch', 'generate-statements', 'assess-arrears'];

  return times(count, (index) => {
    const failed = index % 7 === 6;
    const startedAt = clock.daysAgo(index);

    return {
      id: opaqueId(),
      name: NAMES[index % NAMES.length] ?? 'accrue-interest',
      queue: 'scheduled',
      status: failed ? ('FAILED' as const) : ('COMPLETED' as const),
      attempts: failed ? 3 : 1,
      maxAttempts: 3,
      durationMs: faker.number.int({ min: 120, max: 42_000 }),
      failureReason: failed ? 'Downstream rail timed out after 30s.' : null,
      traceId: opaqueId(),
      scheduledAt: startedAt,
      startedAt,
      finishedAt: startedAt,
    };
  });
}

/** Feature flags. */
export function makeFeatureFlags(clock: MockClock): FeatureFlag[] {
  const SEED: readonly { key: string; enabled: boolean; rolloutBps: number }[] = [
    { key: 'passkeys', enabled: true, rolloutBps: 10_000 },
    { key: 'round-ups', enabled: true, rolloutBps: 5_000 },
    { key: 'fx-alerts', enabled: false, rolloutBps: 0 },
    { key: 'business-payroll', enabled: true, rolloutBps: 2_500 },
  ];

  return SEED.map((entry) => ({
    key: entry.key,
    description: `Controls the ${entry.key.replaceAll('-', ' ')} experience.`,
    enabled: entry.enabled,
    rolloutBps: entry.rolloutBps,
    segments: [],
    updatedAt: clock.daysAgo(faker.number.int({ min: 1, max: 120 })),
  }));
}

/** A database snapshot. */
export function makeSnapshot(options: FactoryOptions<Snapshot> & { label: string }): Snapshot {
  const { clock, label, overrides } = options;

  return {
    id: opaqueId(),
    label,
    description: null,
    documentCounts: {
      users: faker.number.int({ min: 1, max: 500 }),
      accounts: faker.number.int({ min: 1, max: 900 }),
      transactions: faker.number.int({ min: 100, max: 90_000 }),
    },
    simulatedAt: clock.nowIso(),
    createdAt: clock.nowIso(),
    ...overrides,
  };
}
