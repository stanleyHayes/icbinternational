/**
 * The remaining seed slices: catalogue, content, business and files.
 *
 * Split out of `seed.ts` purely for size. Each function returns a fragment of
 * `MockDatabase`, and `buildDatabase` spreads them together.
 */

import type {
  BusinessApproval,
  BusinessMember,
  BusinessRole,
  Invoice,
  PayrollRun,
} from '@reliance/api-client';
import { AccountType, FeeKind, type FeeScheduleEntry, type Product } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { makeArticle, makeCmsPage, makeFaq, makeLocation } from '../factories/engagement.js';
import { faker, opaqueId, times } from '../faker.js';

import type { MockClock } from './clock.js';
import { money, zero } from './money.js';

/** Marketing pages the site is built against. */
const MARKETING_PAGES: readonly { slug: string; title: string }[] = [
  { slug: 'personal', title: 'Personal banking' },
  { slug: 'business', title: 'Business banking' },
  { slug: 'savings', title: 'Savings' },
  { slug: 'loans', title: 'Loans' },
  { slug: 'about', title: 'About Reliance Bank' },
];

/** The published fee schedule. */
function buildFees(): FeeScheduleEntry[] {
  const SEED: readonly { kind: FeeKind; label: string; flatMinor: number; free: number }[] = [
    { kind: FeeKind.MONTHLY_MAINTENANCE, label: 'Monthly account fee', flatMinor: 0, free: 0 },
    { kind: FeeKind.ATM_INTERNATIONAL, label: 'ATM withdrawal abroad', flatMinor: 200, free: 3 },
    { kind: FeeKind.DOMESTIC_TRANSFER, label: 'Domestic transfer', flatMinor: 0, free: 0 },
    {
      kind: FeeKind.INTERNATIONAL_TRANSFER,
      label: 'International transfer',
      flatMinor: 750,
      free: 0,
    },
    { kind: FeeKind.CARD_REPLACEMENT, label: 'Replacement card', flatMinor: 500, free: 1 },
    { kind: FeeKind.RETURNED_PAYMENT, label: 'Returned payment', flatMinor: 1_000, free: 0 },
  ];

  return SEED.map((entry) => ({
    kind: entry.kind,
    label: entry.label,
    flatAmount: money(entry.flatMinor),
    rateBps: null,
    minAmount: null,
    maxAmount: null,
    freeAllowancePerMonth: entry.free,
    waivedForTiers: entry.kind === FeeKind.ATM_INTERNATIONAL ? ['PREMIUM', 'METAL'] : [],
  }));
}

const NO_LIMIT = { perTransaction: null, daily: null, monthly: null, dailyCount: null };

/** The product catalogue. */
function buildProducts(clock: MockClock): Product[] {
  const SEED: readonly { code: string; name: string; type: AccountType; tagline: string }[] = [
    {
      code: 'RB-CURRENT-PLUS',
      name: 'Current Account Plus',
      type: AccountType.CURRENT,
      tagline: 'Everyday banking with no monthly fee',
    },
    {
      code: 'RB-SAVER-EASY',
      name: 'Easy Access Saver',
      type: AccountType.SAVINGS,
      tagline: 'Withdraw any time, interest paid monthly',
    },
    {
      code: 'RB-BUSINESS-PRO',
      name: 'Business Pro',
      type: AccountType.BUSINESS,
      tagline: 'Multi-user access, approvals and payroll',
    },
    {
      code: 'RB-MULTI-CURRENCY',
      name: 'Multi-Currency Wallet',
      type: AccountType.FX_WALLET,
      tagline: 'Hold and spend in twenty-five currencies',
    },
  ];

  const fees = buildFees();

  return SEED.map((entry) => ({
    code: entry.code,
    version: 1,
    name: entry.name,
    tagline: entry.tagline,
    description: `${entry.name}: ${entry.tagline.toLowerCase()}.`,
    accountType: entry.type,
    currencies: ['GBP', 'EUR', 'USD'] as CurrencyCode[],
    minKycTier: entry.type === AccountType.BUSINESS ? 3 : 1,
    minOpeningBalance: zero(),
    minBalance: zero(),
    monthlyFee: zero(),
    creditInterestTiers:
      entry.type === AccountType.SAVINGS
        ? [{ fromAmount: zero(), toAmount: null, annualRateBps: 425 }]
        : [],
    debitInterestBps: entry.type === AccountType.CURRENT ? 3_990 : null,
    fees,
    limits: {
      internalTransfer: NO_LIMIT,
      domesticTransfer: { ...NO_LIMIT, daily: money(2_500_000) },
      internationalTransfer: { ...NO_LIMIT, daily: money(1_000_000) },
      cardSpend: { ...NO_LIMIT, daily: money(500_000) },
      atmWithdrawal: { ...NO_LIMIT, daily: money(50_000) },
    },
    features: ['Instant notifications', 'Freeze and unfreeze', 'Round-ups'],
    active: true,
    effectiveFrom: clock.dateDaysAgo(400),
    effectiveTo: null,
  }));
}

/** Catalogue and marketing content. */
export function seedCatalogue(
  clock: MockClock,
  counts: { articles: number; faqs: number; locations: number },
) {
  return {
    products: buildProducts(clock),
    fees: buildFees(),
    pages: MARKETING_PAGES.map((page) =>
      makeCmsPage({ clock, slug: page.slug, title: page.title }),
    ),
    articles: times(counts.articles, () => makeArticle({ clock })),
    faqs: times(counts.faqs, (index) => makeFaq({ index })),
    locations: times(counts.locations, () => makeLocation({})),
  };
}

/** The business-banking slice. */
export function seedBusiness(clock: MockClock, settlementAccountId: string) {
  const ROLES: readonly BusinessRole[] = ['OWNER', 'ADMIN', 'APPROVER', 'BOOKKEEPER'];

  const members = times<BusinessMember>(4, (index) => ({
    id: opaqueId(),
    userId: null,
    email: faker.internet.email({ provider: 'acme.test' }).toLowerCase(),
    fullName: faker.person.fullName(),
    role: ROLES[index] ?? 'VIEWER',
    status: 'ACTIVE' as const,
    accountIds: [settlementAccountId],
    approvalThreshold: index > 1 ? money(500_000) : null,
    invitedAt: clock.daysAgo(300 - index * 20),
    joinedAt: clock.daysAgo(299 - index * 20),
    lastActiveAt: clock.daysAgo(index),
  }));

  const invoices = times<Invoice>(6, (index) => {
    const unitPrice = money(faker.number.int({ min: 20_000, max: 400_000 }));
    const quantity = faker.number.int({ min: 1, max: 5 });
    const subtotalMinor = BigInt(unitPrice.amount) * BigInt(quantity);
    const taxMinor = (subtotalMinor * 2_000n) / 10_000n;

    return {
      id: opaqueId(),
      number: `INV-${String(1000 + index)}`,
      status: index % 3 === 0 ? 'PAID' : 'SENT',
      customerName: faker.company.name(),
      customerEmail: faker.internet.email().toLowerCase(),
      lines: [
        {
          description: 'Professional services',
          quantity,
          unitPrice,
          taxRateBps: 2_000,
          lineTotal: money(subtotalMinor),
        },
      ],
      subtotal: money(subtotalMinor),
      tax: money(taxMinor),
      total: money(subtotalMinor + taxMinor),
      amountPaid: index % 3 === 0 ? money(subtotalMinor + taxMinor) : zero(),
      amountDue: index % 3 === 0 ? zero() : money(subtotalMinor + taxMinor),
      payUrl: `https://pay.reliance.test/i/${opaqueId()}`,
      settlementAccountId,
      notes: null,
      issuedOn: clock.dateDaysAgo(30 + index * 7),
      dueOn: clock.dateDaysAhead(index * 7),
      paidAt: index % 3 === 0 ? clock.daysAgo(index * 3) : null,
      createdAt: clock.daysAgo(31 + index * 7),
    };
  });

  return {
    businessMembers: members,
    businessApprovals: times<BusinessApproval>(3, (index) => ({
      id: opaqueId(),
      kind: 'TRANSFER',
      status: 'PENDING',
      amount: money(faker.number.int({ min: 100_000, max: 2_000_000 })),
      summary: `Supplier payment ${index + 1}`,
      requestedByName: members[1]?.fullName ?? 'A colleague',
      approvedByNames: [],
      approvalsRequired: 2,
      decisionNote: null,
      targetId: opaqueId(),
      expiresAt: clock.daysAhead(2),
      createdAt: clock.daysAgo(1),
      decidedAt: null,
    })),
    invoices,
    payrollRuns: [buildPayrollRun(clock, settlementAccountId)],
  };
}

function buildPayrollRun(clock: MockClock, sourceAccountId: string): PayrollRun {
  const lines = times(8, () => {
    const gross = money(faker.number.int({ min: 250_000, max: 700_000 }));
    const deductions = money((BigInt(gross.amount) * 2_800n) / 10_000n);
    return {
      employeeName: faker.person.fullName(),
      accountNumber: faker.string.numeric(10),
      sortCode: faker.string.numeric(6),
      grossPay: gross,
      deductions,
      netPay: money(BigInt(gross.amount) - BigInt(deductions.amount)),
      status: 'PAID' as const,
      failureReason: null,
    };
  });

  const totalGross = lines.reduce((sum, line) => sum + BigInt(line.grossPay.amount), 0n);
  const totalNet = lines.reduce((sum, line) => sum + BigInt(line.netPay.amount), 0n);

  return {
    id: opaqueId(),
    period: clock.todayIso().slice(0, 7),
    status: 'COMPLETED' as const,
    sourceAccountId,
    lines,
    totalGross: money(totalGross),
    totalNet: money(totalNet),
    employeeCount: lines.length,
    payOn: clock.dateDaysAgo(2),
    createdAt: clock.daysAgo(5),
    completedAt: clock.daysAgo(2),
  };
}

/**
 * Stored files and asynchronous artefacts.
 *
 * Deliberately empty. These collections exist to receive what the mock API produces
 * during a session; pre-filling them would show the customer export jobs they never
 * asked for, and an honest empty state is more useful to build against.
 */
export function seedFiles() {
  return { files: [], documentJobs: [], dataExports: [] };
}
