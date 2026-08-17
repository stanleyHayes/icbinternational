/**
 * The shape of the in-memory bank.
 *
 * A single mutable object rather than a set of independent stores, because the whole
 * value of these mocks is that the pieces agree with each other: a transfer has to move
 * a balance *and* appear in a transaction list *and* show up in the notification feed.
 * Separate stores make that agreement optional, and optional agreement is the thing a
 * random-data mock gets wrong.
 */

import type {
  AdminRoleDefinition,
  BankLetter,
  BusinessApproval,
  BusinessMember,
  CommsCampaign,
  CommsTemplate,
  DataExport,
  DocumentJob,
  FileReference,
  FraudRule,
  Invoice,
  JobRun,
  Passkey,
  PayrollRun,
  ScreeningHit,
} from '@reliance/api-client';
import type {
  Account,
  AdminChatConversation,
  AdminUser,
  AmlAlert,
  AmlCase,
  AmlRule,
  ApprovalRequest,
  AuditEvent,
  Article,
  Beneficiary,
  Biller,
  BillPayment,
  BulkTransfer,
  Card,
  CardAuthorisation,
  CmsPage,
  Deposit,
  DepositRate,
  Device,
  Dispute,
  Faq,
  FeatureFlag,
  FeeScheduleEntry,
  FxAlert,
  FxRate,
  Goal,
  Hold,
  JournalEntry,
  KycCase,
  Loan,
  LoanApplication,
  LoanProduct,
  BankLocation,
  Mandate,
  Money,
  Notification,
  NotificationPreferences,
  PaymentRequest,
  Product,
  Profile,
  RailBehaviour,
  Session,
  Snapshot,
  Statement,
  Ticket,
  Transaction,
  Transfer,
  TransferDestination,
  TransferOrder,
  User,
} from '@reliance/contracts';

import type { MockClock } from './clock.js';

/**
 * A live transfer quote.
 *
 * Held in the store rather than a module-level cache so `resetMockDatabase()` clears it
 * with everything else — a quote surviving a reset is a test that passes because the
 * previous test primed it.
 */
export interface MockTransferQuote {
  destination: TransferDestination;
  debit: Money;
  fee: Money;
  sourceAccountId: string;
  expiresAt: string;
}

/** Fraud reports, which have no contract type of their own. */
export interface MockFraudReport {
  id: string;
  reference: string;
  frozenCardIds: string[];
  frozenAccountIds: string[];
  ticketId: string | null;
  createdAt: string;
}

/** Everything the mock bank knows. Mutated in place by handlers. */
export interface MockDatabase {
  readonly clock: MockClock;
  readonly seed: number;

  // --- Identity -----------------------------------------------------------
  /** The signed-in customer. Every "my" route resolves against this one. */
  currentUser: User;
  users: User[];
  profile: Profile;
  sessions: Session[];
  devices: Device[];
  passkeys: Passkey[];
  kycCase: KycCase;

  // --- Core banking -------------------------------------------------------
  accounts: Account[];
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  holds: Hold[];
  statements: Statement[];
  letters: BankLetter[];

  // --- Money movement -----------------------------------------------------
  transfers: Transfer[];
  /** Quotes issued but not yet executed, keyed by quote id. */
  transferQuotes: Record<string, MockTransferQuote>;
  beneficiaries: Beneficiary[];
  transferOrders: TransferOrder[];
  bulkTransfers: BulkTransfer[];
  billers: Biller[];
  billPayments: BillPayment[];
  paymentRequests: PaymentRequest[];
  mandates: Mandate[];

  // --- Products -----------------------------------------------------------
  cards: Card[];
  authorisations: CardAuthorisation[];
  goals: Goal[];
  deposits: Deposit[];
  depositRates: DepositRate[];
  loans: Loan[];
  loanApplications: LoanApplication[];
  loanProducts: LoanProduct[];
  products: Product[];
  fees: FeeScheduleEntry[];

  // --- FX -----------------------------------------------------------------
  fxRates: FxRate[];
  fxAlerts: FxAlert[];

  // --- Engagement ---------------------------------------------------------
  notifications: Notification[];
  notificationPreferences: NotificationPreferences;
  tickets: Ticket[];
  disputes: Dispute[];
  fraudReports: MockFraudReport[];
  /** Live chat threads, in the agent-facing shape; participant views are projected. */
  chatConversations: AdminChatConversation[];
  /** Guest stream tokens, mapped to the conversation they authorise. */
  chatGuestTokens: Record<string, string>;

  // --- Content ------------------------------------------------------------
  pages: CmsPage[];
  articles: Article[];
  faqs: Faq[];
  locations: BankLocation[];

  // --- Business -----------------------------------------------------------
  businessMembers: BusinessMember[];
  businessApprovals: BusinessApproval[];
  invoices: Invoice[];
  payrollRuns: PayrollRun[];

  // --- Files --------------------------------------------------------------
  files: FileReference[];
  documentJobs: DocumentJob[];
  dataExports: DataExport[];

  // --- Operations ---------------------------------------------------------
  adminUsers: AdminUser[];
  adminRoles: AdminRoleDefinition[];
  auditEvents: AuditEvent[];
  approvals: ApprovalRequest[];
  amlAlerts: AmlAlert[];
  amlCases: AmlCase[];
  amlRules: AmlRule[];
  fraudRules: FraudRule[];
  screeningHits: ScreeningHit[];
  commsTemplates: CommsTemplate[];
  commsCampaigns: CommsCampaign[];
  jobRuns: JobRun[];
  featureFlags: FeatureFlag[];
  snapshots: Snapshot[];

  /** How each simulated rail is behaving. Mutable from the simulation console. */
  rails: RailBehaviour[];

  /** Which scripted scenario is running, if any. */
  activeScenario: string | null;
}
