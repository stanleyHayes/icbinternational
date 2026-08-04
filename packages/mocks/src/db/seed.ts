/**
 * Building a coherent bank from a seed.
 *
 * Order matters here, and it is not arbitrary: the customer exists before their
 * accounts, the accounts before their transactions, and the transactions before the
 * balances that are derived from them. Anything built out of order ends up referring to
 * an id that does not exist yet — which is exactly the incoherence these mocks exist to
 * avoid.
 */

import { AccountType, type Account, type Transaction, type User } from '@reliance/contracts';

import { makeAccount, makeBalance, makeStatements, makeTransaction } from '../factories/banking.js';
import {
  makeDispute,
  makeNotificationPreferences,
  makeNotifications,
  makeTicket,
} from '../factories/engagement.js';
import {
  makeDevice,
  makeKycCase,
  makePasskey,
  makeProfile,
  makeSession,
  makeUser,
} from '../factories/identity.js';
import {
  makeBeneficiary,
  makeBillPayment,
  makeBillers,
  makeBulkTransfer,
  makeMandate,
  makePaymentRequest,
  makeTransfer,
  makeTransferOrder,
} from '../factories/movement.js';
import {
  makeAdminRoles,
  makeAdminUser,
  makeAmlAlert,
  makeAmlCase,
  makeAmlRules,
  makeApprovalRequest,
  makeAuditTrail,
  makeCommsCampaigns,
  makeCommsTemplates,
  makeFeatureFlags,
  makeFraudRules,
  makeJobRuns,
  makeScreeningHit,
} from '../factories/operations.js';
import {
  makeAuthorisation,
  makeCard,
  makeDeposit,
  makeDepositRates,
  makeFxRates,
  makeGoal,
  makeLoan,
  makeLoanProducts,
} from '../factories/products.js';
import { opaqueId, times } from '../faker.js';

import { type MockClock } from './clock.js';
import { minorUnits } from './money.js';
import { defaultRails } from './rails.js';
import { seedBusiness, seedCatalogue, seedFiles } from './seed-support.js';
import type { MockDatabase } from './types.js';

/** How much history the default fixture set contains. */
const VOLUMES = {
  transactionsPerAccount: 45,
  statements: 6,
  beneficiaries: 6,
  transfers: 12,
  notifications: 14,
  auditEvents: 40,
  jobRuns: 21,
  articles: 8,
  faqs: 8,
  locations: 12,
} as const;

/** Builds the whole mock bank. Deterministic for a given seed. */
export function buildDatabase(seed: number, clock: MockClock): MockDatabase {
  const currentUser = makeUser({ clock });
  const accounts = buildAccounts(clock, currentUser.id);
  const transactions = accounts.flatMap((account) => buildAccountHistory(clock, account));
  const primary = accounts[0];
  if (!primary) throw new Error('Seed produced no accounts.');

  return {
    clock,
    seed,
    ...buildIdentity(clock, currentUser),
    ...buildBanking(clock, accounts, transactions, primary),
    ...buildMovement(clock, primary),
    ...buildProducts(clock, accounts, primary, currentUser),
    ...buildEngagement(clock, currentUser, transactions),
    ...seedCatalogue(clock, {
      articles: VOLUMES.articles,
      faqs: VOLUMES.faqs,
      locations: VOLUMES.locations,
    }),
    ...seedBusiness(clock, primary.id),
    ...seedFiles(),
    ...buildOperations(clock, currentUser),
    rails: defaultRails(),
    activeScenario: null,
  };
}

function buildAccounts(clock: MockClock, userId: string): Account[] {
  return [
    makeAccount({ clock, userId, type: AccountType.CURRENT }),
    makeAccount({ clock, userId, type: AccountType.SAVINGS }),
    makeAccount({ clock, userId, type: AccountType.FX_WALLET }),
  ];
}

/**
 * Walks an account's history backwards, threading the running balance.
 *
 * Built from the *current* balance rather than towards it, so the newest transaction's
 * `runningBalance` equals the account's balance exactly. A feed whose top row disagrees
 * with the balance card above it is the first thing a reviewer notices.
 */
function buildAccountHistory(clock: MockClock, account: Account): Transaction[] {
  const history: Transaction[] = [];
  let running = minorUnits(account.balance.ledger);

  for (let index = 0; index < VOLUMES.transactionsPerAccount; index += 1) {
    const transaction = makeTransaction({
      clock,
      account,
      runningBalanceMinor: running,
      overrides: { bookedAt: clock.daysAgo(index * 2), completedAt: clock.daysAgo(index * 2) },
    });
    history.push(transaction);
    running += minorUnits(transaction.amount);
  }

  return history;
}

function buildIdentity(clock: MockClock, currentUser: User) {
  return {
    currentUser,
    users: [currentUser, ...times(4, () => makeUser({ clock }))],
    profile: makeProfile({ clock, userId: currentUser.id }),
    sessions: [
      makeSession({ clock, overrides: { current: true, deviceLabel: 'MacBook Pro' } }),
      makeSession({ clock }),
    ],
    devices: times(3, () => makeDevice({ clock })),
    passkeys: times(2, () => makePasskey({ clock })),
    kycCase: makeKycCase({ clock, userId: currentUser.id }),
  };
}

function buildBanking(
  clock: MockClock,
  accounts: Account[],
  transactions: Transaction[],
  primary: Account,
) {
  return {
    accounts,
    transactions,
    journalEntries: [],
    holds: [],
    statements: makeStatements({ clock, account: primary, count: VOLUMES.statements }),
    letters: [],
  };
}

function buildMovement(clock: MockClock, primary: Account) {
  const beneficiaries = times(VOLUMES.beneficiaries, () => makeBeneficiary({ clock }));
  const billers = makeBillers();
  const firstBeneficiary = beneficiaries[0];
  const firstBiller = billers[0];

  return {
    beneficiaries,
    billers,
    transfers: times(VOLUMES.transfers, () => makeTransfer({ clock, sourceAccountId: primary.id })),
    transferOrders:
      firstBeneficiary === undefined
        ? []
        : times(2, () =>
            makeTransferOrder({
              clock,
              sourceAccountId: primary.id,
              beneficiaryId: firstBeneficiary.id,
            }),
          ),
    transferQuotes: {},
    bulkTransfers: [makeBulkTransfer({ clock, sourceAccountId: primary.id })],
    billPayments:
      firstBiller === undefined
        ? []
        : times(5, () =>
            makeBillPayment({ clock, biller: firstBiller, sourceAccountId: primary.id }),
          ),
    paymentRequests: times(3, () =>
      makePaymentRequest({
        clock,
        destinationAccountId: primary.id,
        requesterName: 'You',
      }),
    ),
    mandates: times(4, () => makeMandate({ clock, accountId: primary.id })),
  };
}

function buildProducts(clock: MockClock, accounts: Account[], primary: Account, currentUser: User) {
  const savings = accounts[1] ?? primary;
  const cards = [
    makeCard({
      clock,
      accountId: primary.id,
      cardholderName: `${currentUser.firstName} ${currentUser.lastName}`,
    }),
  ];
  const loanProducts = makeLoanProducts();
  const personalLoan = loanProducts[0];
  const firstCard = cards[0];

  return {
    cards,
    authorisations:
      firstCard === undefined
        ? []
        : times(10, () =>
            makeAuthorisation({ clock, cardId: firstCard.id, accountId: primary.id }),
          ),
    goals: times(2, () => makeGoal({ clock, linkedAccountId: savings.id })),
    deposits: [makeDeposit({ clock, sourceAccountId: savings.id })],
    depositRates: makeDepositRates(),
    loanProducts,
    loans:
      personalLoan === undefined
        ? []
        : [makeLoan({ clock, applicationId: opaqueId(), product: personalLoan })],
    loanApplications: [],
    fxRates: makeFxRates(clock),
    fxAlerts: [],
  };
}

function buildEngagement(clock: MockClock, currentUser: User, transactions: Transaction[]) {
  const disputed = transactions[3];
  const customerName = `${currentUser.firstName} ${currentUser.lastName}`;

  return {
    notifications: makeNotifications(clock, VOLUMES.notifications),
    notificationPreferences: makeNotificationPreferences(),
    tickets: [makeTicket({ clock, customerName })],
    disputes:
      disputed === undefined
        ? []
        : [
            makeDispute({
              clock,
              transactionId: disputed.id,
              amountMinor: minorUnits(disputed.amount),
            }),
          ],
    fraudReports: [],
  };
}

function buildOperations(clock: MockClock, currentUser: User) {
  const customerName = `${currentUser.firstName} ${currentUser.lastName}`;
  const amlRules = makeAmlRules(clock);
  const firstRule = amlRules[0];
  const amlAlerts =
    firstRule === undefined
      ? []
      : times(6, () =>
          makeAmlAlert({ clock, rule: firstRule, userId: currentUser.id, customerName }),
        );
  const templates = makeCommsTemplates(clock);

  return {
    adminUsers: times(5, () => makeAdminUser({ clock })),
    adminRoles: makeAdminRoles(),
    approvals: times(3, () => makeApprovalRequest({ clock })),
    amlAlerts,
    amlCases: [
      makeAmlCase({
        clock,
        userId: currentUser.id,
        customerName,
        alertIds: amlAlerts.slice(0, 2).map((alert) => alert.id),
      }),
    ],
    amlRules,
    fraudRules: makeFraudRules(clock),
    screeningHits: times(4, () =>
      makeScreeningHit({ clock, userId: currentUser.id, customerName }),
    ),
    commsTemplates: templates,
    commsCampaigns: makeCommsCampaigns({
      clock,
      templateIds: templates.map((template) => template.id),
      count: 4,
    }),
    jobRuns: makeJobRuns({ clock, count: VOLUMES.jobRuns }),
    featureFlags: makeFeatureFlags(clock),
    snapshots: [],
    auditEvents: makeAuditTrail({ clock, count: VOLUMES.auditEvents }),
  };
}

/** Recomputes an account's balance from a new ledger figure. */
export function rebalance(account: Account, ledgerMinor: bigint, clock: MockClock): Account {
  return {
    ...account,
    balance: makeBalance({
      clock,
      ledgerMinor,
      heldMinor: minorUnits(account.balance.held),
      overdraftMinor: minorUnits(account.balance.overdraftAvailable),
      currency: account.currency,
    }),
  };
}
