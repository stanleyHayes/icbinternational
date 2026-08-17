/**
 * Every fixture must satisfy its contract schema.
 *
 * This is the assertion that makes the mocks trustworthy. `@reliance/api-client`
 * validates responses against these same schemas in development, so a fixture that does
 * not parse would surface to a UI lane as an `INTERNAL_ERROR` from their own mock — a
 * genuinely baffling failure to debug. Better to fail here, by name, in this package.
 *
 * Note the ISO-8601 detail this catches: `isoDateTimeSchema` is
 * `z.iso.datetime({ offset: false })`, which requires a trailing `Z`. A timestamp built
 * with anything other than `toISOString()` fails, and every date in these fixtures goes
 * through the clock for exactly that reason.
 */

import type { ZodType } from 'zod';

import {
  businessApprovalSchema,
  businessMemberSchema,
  commsCampaignSchema,
  commsTemplateSchema,
  fraudRuleSchema,
  invoiceSchema,
  jobRunSchema,
  passkeySchema,
  payrollRunSchema,
  screeningHitSchema,
} from '@reliance/api-client';
import {
  accountSchema,
  adminChatConversationSchema,
  adminUserSchema,
  amlAlertSchema,
  amlCaseSchema,
  amlRuleSchema,
  approvalRequestSchema,
  articleSchema,
  beneficiarySchema,
  billPaymentSchema,
  billerSchema,
  bulkTransferSchema,
  cardAuthorisationSchema,
  cardSchema,
  cmsPageSchema,
  depositRateSchema,
  depositSchema,
  deviceSchema,
  disputeSchema,
  faqSchema,
  featureFlagSchema,
  feeScheduleEntrySchema,
  fxRateSchema,
  goalSchema,
  kycCaseSchema,
  loanProductSchema,
  loanSchema,
  locationSchema,
  mandateSchema,
  notificationPreferencesSchema,
  notificationSchema,
  paymentRequestSchema,
  productSchema,
  profileSchema,
  sessionSchema,
  statementSchema,
  ticketSchema,
  transactionSchema,
  transferOrderSchema,
  transferSchema,
  userSchema,
} from '@reliance/contracts';

import { db, resetMockDatabase } from '../db/database.js';
import type { MockDatabase } from '../db/types.js';

/** One collection and the schema its items must satisfy. */
interface CollectionCase {
  readonly name: string;
  readonly schema: ZodType;
  readonly select: (database: MockDatabase) => readonly unknown[];
}

const COLLECTIONS: readonly CollectionCase[] = [
  { name: 'users', schema: userSchema, select: (d) => d.users },
  { name: 'sessions', schema: sessionSchema, select: (d) => d.sessions },
  { name: 'devices', schema: deviceSchema, select: (d) => d.devices },
  { name: 'passkeys', schema: passkeySchema, select: (d) => d.passkeys },
  { name: 'accounts', schema: accountSchema, select: (d) => d.accounts },
  { name: 'transactions', schema: transactionSchema, select: (d) => d.transactions },
  { name: 'statements', schema: statementSchema, select: (d) => d.statements },
  { name: 'transfers', schema: transferSchema, select: (d) => d.transfers },
  { name: 'beneficiaries', schema: beneficiarySchema, select: (d) => d.beneficiaries },
  { name: 'transferOrders', schema: transferOrderSchema, select: (d) => d.transferOrders },
  { name: 'bulkTransfers', schema: bulkTransferSchema, select: (d) => d.bulkTransfers },
  { name: 'billers', schema: billerSchema, select: (d) => d.billers },
  { name: 'billPayments', schema: billPaymentSchema, select: (d) => d.billPayments },
  { name: 'paymentRequests', schema: paymentRequestSchema, select: (d) => d.paymentRequests },
  { name: 'mandates', schema: mandateSchema, select: (d) => d.mandates },
  { name: 'cards', schema: cardSchema, select: (d) => d.cards },
  { name: 'authorisations', schema: cardAuthorisationSchema, select: (d) => d.authorisations },
  { name: 'goals', schema: goalSchema, select: (d) => d.goals },
  { name: 'deposits', schema: depositSchema, select: (d) => d.deposits },
  { name: 'depositRates', schema: depositRateSchema, select: (d) => d.depositRates },
  { name: 'loans', schema: loanSchema, select: (d) => d.loans },
  { name: 'loanProducts', schema: loanProductSchema, select: (d) => d.loanProducts },
  { name: 'products', schema: productSchema, select: (d) => d.products },
  { name: 'fees', schema: feeScheduleEntrySchema, select: (d) => d.fees },
  { name: 'fxRates', schema: fxRateSchema, select: (d) => d.fxRates },
  { name: 'notifications', schema: notificationSchema, select: (d) => d.notifications },
  { name: 'tickets', schema: ticketSchema, select: (d) => d.tickets },
  {
    name: 'chatConversations',
    schema: adminChatConversationSchema,
    select: (d) => d.chatConversations,
  },
  { name: 'disputes', schema: disputeSchema, select: (d) => d.disputes },
  { name: 'pages', schema: cmsPageSchema, select: (d) => d.pages },
  { name: 'articles', schema: articleSchema, select: (d) => d.articles },
  { name: 'faqs', schema: faqSchema, select: (d) => d.faqs },
  { name: 'locations', schema: locationSchema, select: (d) => d.locations },
  { name: 'businessMembers', schema: businessMemberSchema, select: (d) => d.businessMembers },
  {
    name: 'businessApprovals',
    schema: businessApprovalSchema,
    select: (d) => d.businessApprovals,
  },
  { name: 'invoices', schema: invoiceSchema, select: (d) => d.invoices },
  { name: 'payrollRuns', schema: payrollRunSchema, select: (d) => d.payrollRuns },
  { name: 'adminUsers', schema: adminUserSchema, select: (d) => d.adminUsers },
  { name: 'approvals', schema: approvalRequestSchema, select: (d) => d.approvals },
  { name: 'amlAlerts', schema: amlAlertSchema, select: (d) => d.amlAlerts },
  { name: 'amlCases', schema: amlCaseSchema, select: (d) => d.amlCases },
  { name: 'amlRules', schema: amlRuleSchema, select: (d) => d.amlRules },
  { name: 'fraudRules', schema: fraudRuleSchema, select: (d) => d.fraudRules },
  { name: 'screeningHits', schema: screeningHitSchema, select: (d) => d.screeningHits },
  { name: 'commsTemplates', schema: commsTemplateSchema, select: (d) => d.commsTemplates },
  { name: 'commsCampaigns', schema: commsCampaignSchema, select: (d) => d.commsCampaigns },
  { name: 'jobRuns', schema: jobRunSchema, select: (d) => d.jobRuns },
  { name: 'featureFlags', schema: featureFlagSchema, select: (d) => d.featureFlags },
];

beforeAll(() => {
  resetMockDatabase();
});

describe('fixtures satisfy the contract', () => {
  it.each(COLLECTIONS.map((entry) => [entry.name, entry] as const))('%s', (name, entry) => {
    const items = entry.select(db());
    expect(items.length).toBeGreaterThan(0);

    for (const [index, item] of items.entries()) {
      const parsed = entry.schema.safeParse(item);
      if (!parsed.success) {
        throw new Error(
          `${name}[${index}] does not satisfy its contract schema:\n` +
            parsed.error.issues
              .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
              .join('\n'),
        );
      }
    }
  });

  it('the KYC case satisfies its schema', () => {
    expect(kycCaseSchema.safeParse(db().kycCase).success).toBe(true);
  });

  it('the profile satisfies its schema', () => {
    expect(profileSchema.safeParse(db().profile).success).toBe(true);
  });

  it('the notification preferences satisfy their schema', () => {
    expect(notificationPreferencesSchema.safeParse(db().notificationPreferences).success).toBe(
      true,
    );
  });

  it('holds the whole fixture set to the same standard across several seeds', () => {
    for (const seed of [1, 99, 20260802]) {
      const database = resetMockDatabase(seed);
      for (const entry of COLLECTIONS) {
        for (const item of entry.select(database)) {
          expect(entry.schema.safeParse(item).success).toBe(true);
        }
      }
    }
    resetMockDatabase();
  });
});
