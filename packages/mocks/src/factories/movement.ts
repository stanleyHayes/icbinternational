/**
 * Money-movement fixtures: transfers, payees, standing orders, bills and requests.
 */

import {
  BillerCategory,
  BillPaymentStatus,
  MandateStatus,
  NameCheckResult,
  PaymentRequestStatus,
  RecurrenceFrequency,
  TransferOrderStatus,
  TransferRail,
  TransferStatus,
  type Beneficiary,
  type Biller,
  type BillPayment,
  type BulkTransfer,
  type Mandate,
  type PaymentRequest,
  type Transfer,
  type TransferDestination,
  type TransferOrder,
} from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { addMoney, money, sumMoney, zero } from '../db/money.js';
import { faker, mockId, opaqueId, pickOne, times } from '../faker.js';

import type { FactoryOptions } from './identity.js';

/** A domestic payee destination. */
export function makeDomesticDestination(name?: string): TransferDestination {
  return {
    kind: 'DOMESTIC',
    accountName: name ?? faker.person.fullName(),
    accountNumber: faker.string.numeric(10),
    sortCode: faker.string.numeric(6),
    bankName: pickOne(['Barclays', 'HSBC', 'Lloyds', 'NatWest', 'Monzo', 'Starling']),
  };
}

/** A saved payee. */
export function makeBeneficiary(options: FactoryOptions<Beneficiary>): Beneficiary {
  const { clock, overrides } = options;
  const name = faker.person.fullName();

  return {
    id: mockId('ben'),
    nickname: name,
    destination: makeDomesticDestination(name),
    currency: 'GBP',
    nameCheck: NameCheckResult.MATCH,
    nameCheckSuggestion: null,
    isFavourite: faker.datatype.boolean(),
    trustedFrom: clock.daysAgo(faker.number.int({ min: 5, max: 200 })),
    lastUsedAt: clock.daysAgo(faker.number.int({ min: 1, max: 60 })),
    createdAt: clock.daysAgo(faker.number.int({ min: 30, max: 400 })),
    ...overrides,
  };
}

/** A settled internal transfer. */
export function makeTransfer(
  options: FactoryOptions<Transfer> & {
    sourceAccountId: string;
    amountMinor?: bigint;
    currency?: CurrencyCode;
  },
): Transfer {
  const { clock, overrides, sourceAccountId } = options;
  const currency = options.currency ?? 'GBP';
  const amount = money(
    options.amountMinor ?? BigInt(faker.number.int({ min: 2_000, max: 150_000 })),
    currency,
  );
  const createdAt = clock.daysAgo(faker.number.int({ min: 0, max: 60 }));

  return {
    id: mockId('trf'),
    rail: TransferRail.DOMESTIC_ACH,
    status: TransferStatus.SETTLED,
    sourceAccountId,
    destination: makeDomesticDestination(),
    debitAmount: amount,
    creditAmount: amount,
    fee: zero(currency),
    exchangeRate: null,
    reference: pickOne(['Rent', 'Dinner', 'Shared bills', 'Birthday', 'Invoice 1042']),
    railReference: faker.string.alphanumeric({ length: 18, casing: 'upper' }),
    returnCode: null,
    returnReason: null,
    journalEntryId: mockId('jnl'),
    timeline: [
      { status: TransferStatus.PENDING, at: createdAt, detail: 'Payment created' },
      { status: TransferStatus.SUBMITTED, at: createdAt, detail: 'Sent to clearing' },
      { status: TransferStatus.SETTLED, at: createdAt, detail: 'Funds delivered' },
    ],
    estimatedArrival: createdAt,
    createdAt,
    settledAt: createdAt,
    ...overrides,
  };
}

/** A standing order. */
export function makeTransferOrder(
  options: FactoryOptions<TransferOrder> & { sourceAccountId: string; beneficiaryId: string },
): TransferOrder {
  const { beneficiaryId, clock, overrides, sourceAccountId } = options;

  return {
    id: mockId('tro'),
    name: pickOne(['Rent', 'Gym membership', 'Savings sweep', 'Childcare']),
    status: TransferOrderStatus.ACTIVE,
    sourceAccountId,
    beneficiaryId,
    amount: money(faker.number.int({ min: 2_500, max: 120_000 })),
    reference: 'Standing order',
    frequency: RecurrenceFrequency.MONTHLY,
    dayOfMonth: faker.number.int({ min: 1, max: 28 }),
    dayOfWeek: null,
    startsOn: clock.dateDaysAgo(365),
    endsOn: null,
    maxOccurrences: null,
    occurrencesRun: faker.number.int({ min: 3, max: 12 }),
    nextRunAt: clock.daysAhead(faker.number.int({ min: 1, max: 30 })),
    lastRunAt: clock.daysAgo(faker.number.int({ min: 1, max: 30 })),
    consecutiveFailures: 0,
    createdAt: clock.daysAgo(370),
    ...overrides,
  };
}

/** A validated bulk payment file. */
export function makeBulkTransfer(
  options: FactoryOptions<BulkTransfer> & { sourceAccountId: string; rowCount?: number },
): BulkTransfer {
  const { clock, overrides, sourceAccountId } = options;
  const rowCount = options.rowCount ?? faker.number.int({ min: 4, max: 12 });

  const rows = times(rowCount, (index) => ({
    rowNumber: index + 1,
    accountName: faker.person.fullName(),
    accountNumber: faker.string.numeric(10),
    sortCode: faker.string.numeric(6),
    amount: money(faker.number.int({ min: 5_000, max: 250_000 })),
    reference: `Batch ${index + 1}`,
    status: 'VALID' as const,
    error: null,
  }));

  return {
    id: opaqueId(),
    sourceAccountId,
    fileName: 'supplier-payments.csv',
    status: 'AWAITING_APPROVAL',
    totalRows: rows.length,
    validRows: rows.length,
    failedRows: 0,
    totalAmount: sumMoney(rows.map((row) => row.amount)),
    rows,
    createdAt: clock.daysAgo(1),
    completedAt: null,
    ...overrides,
  };
}

const BILLER_SEED: readonly { name: string; category: BillerCategory; label: string }[] = [
  { name: 'Thames Water', category: BillerCategory.WATER, label: 'Customer number' },
  { name: 'Octopus Energy', category: BillerCategory.ELECTRICITY, label: 'Account number' },
  { name: 'Virgin Media', category: BillerCategory.INTERNET, label: 'Account number' },
  { name: 'Vodafone UK', category: BillerCategory.MOBILE, label: 'Mobile number' },
  { name: 'Camden Council', category: BillerCategory.COUNCIL_TAX, label: 'Council tax reference' },
  { name: 'Aviva Insurance', category: BillerCategory.INSURANCE, label: 'Policy number' },
  { name: 'Sky', category: BillerCategory.TV, label: 'Account number' },
  { name: 'Oxfam', category: BillerCategory.CHARITY, label: 'Supporter number' },
];

/**
 * The biller directory.
 *
 * A fixed cast rather than random names, so a biller the customer saved in one screen is
 * still findable in the next one — and so a UI test can search for "Octopus" and get a
 * hit on every run.
 */
export function makeBillers(): Biller[] {
  return BILLER_SEED.map((entry) => ({
    id: opaqueId(),
    name: entry.name,
    category: entry.category,
    logoUrl: null,
    accountNumberPattern: '^[0-9]{6,14}$',
    accountNumberLabel: entry.label,
    minAmount: money(100),
    maxAmount: money(500_000),
    fee: zero(),
    supportsValidation: true,
    active: true,
  }));
}

/** A completed bill payment. */
export function makeBillPayment(
  options: FactoryOptions<BillPayment> & { biller: Biller; sourceAccountId: string },
): BillPayment {
  const { biller, clock, overrides, sourceAccountId } = options;
  const amount = money(faker.number.int({ min: 1_500, max: 30_000 }));
  const createdAt = clock.daysAgo(faker.number.int({ min: 1, max: 60 }));

  return {
    id: opaqueId(),
    billerId: biller.id,
    billerName: biller.name,
    status: BillPaymentStatus.COMPLETED,
    sourceAccountId,
    customerReference: faker.string.numeric(10),
    amount,
    fee: zero(),
    billerReceipt: faker.string.alphanumeric({ length: 14, casing: 'upper' }),
    failureReason: null,
    transactionId: mockId('txn'),
    createdAt,
    completedAt: createdAt,
    ...overrides,
  };
}

/** An open payment request. */
export function makePaymentRequest(
  options: FactoryOptions<PaymentRequest> & { destinationAccountId: string; requesterName: string },
): PaymentRequest {
  const { clock, destinationAccountId, overrides, requesterName } = options;
  const token = opaqueId();

  return {
    id: token,
    status: PaymentRequestStatus.OPEN,
    requesterName,
    amount: money(faker.number.int({ min: 500, max: 20_000 })),
    note: pickOne(['Dinner last night', 'Taxi share', 'Concert tickets', 'Groceries']),
    shareUrl: `https://pay.reliance.test/r/${token}`,
    qrPayload: `reliance://pay/${token}`,
    destinationAccountId,
    paidByName: null,
    expiresAt: clock.daysAhead(3),
    createdAt: clock.daysAgo(1),
    paidAt: null,
    ...overrides,
  };
}

/** An active direct-debit mandate. */
export function makeMandate(options: FactoryOptions<Mandate> & { accountId: string }): Mandate {
  const { accountId, clock, overrides } = options;
  const lastAmount = money(faker.number.int({ min: 800, max: 9_000 }));

  return {
    id: opaqueId(),
    status: MandateStatus.ACTIVE,
    merchantName: pickOne(['Netflix', 'Spotify', 'PureGym', 'Thames Water', 'Sky']),
    merchantLogoUrl: null,
    accountId,
    reference: faker.string.alphanumeric({ length: 10, casing: 'upper' }),
    fixedAmount: lastAmount,
    maxAmount: addMoney(lastAmount, money(2_000)),
    frequency: 'Monthly',
    lastCollectedAt: clock.daysAgo(faker.number.int({ min: 1, max: 28 })),
    lastAmount,
    nextExpectedAt: clock.daysAhead(faker.number.int({ min: 1, max: 28 })),
    createdAt: clock.daysAgo(faker.number.int({ min: 60, max: 700 })),
    cancelledAt: null,
    ...overrides,
  };
}
