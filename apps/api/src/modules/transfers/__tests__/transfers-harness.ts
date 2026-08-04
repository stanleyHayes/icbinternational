import { type FeeKind, type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  frozenClock,
  ledgerRigFor,
  retryingRunner,
  type LedgerRig,
} from '../../accounts/__tests__/accounts-harness.js';
import { AccountService, InMemoryAccountStore } from '../../accounts/index.js';
import {
  BeneficiaryService,
  InMemoryBeneficiaryStore,
  InMemoryPayeeDirectory,
  PayeeResolverService,
  PayeeTrustService,
  ResolverPayeeNameAdapter,
} from '../../beneficiaries/index.js';
import { BalanceService } from '../../holds/index.js';
import { type FeeService, type LimitsService, type ProductService } from '../../products/index.js';
import { type TransactionProjectorService } from '../../transactions/transaction-projector.service.js';
import { InMemoryQuoteStore } from '../in-memory-quote.store.js';
import { InMemoryTransferStore } from '../in-memory-transfer.store.js';
import { InternalTransferUseCase } from '../internal-transfer.use-case.js';
import { TransferBookingService } from '../transfer-booking.service.js';
import { TransferExecutionService } from '../transfer-execution.service.js';
import { TransferGuardService } from '../transfer-guard.service.js';
import { TransferPricingService } from '../transfer-pricing.service.js';
import { TransferQuoteService } from '../transfer-quote.service.js';
import { TransferService } from '../transfer.service.js';

import {
  RecordingProjector,
  RecordingStepUp,
  StubFeeService,
  StubLimitsService,
  StubProductService,
} from './transfers-stubs.js';

/**
 * The transfers lane wired end to end over in-memory stores.
 *
 * Everything below the stubs is real: the pricing split, the cooling-off rule, the payee
 * resolver, the availability arithmetic and its optimistic-concurrency contract, the
 * posting service, the chart of accounts and the double-entry invariant. A transfer in
 * these tests books a genuine balanced journal entry and moves two real account
 * projections, which is the only way to be sure the execution path does either.
 */
export interface TransfersRig {
  accounts: InMemoryAccountStore;
  beneficiaries: BeneficiaryService;
  trust: PayeeTrustService;
  directory: InMemoryPayeeDirectory;
  quoteStore: InMemoryQuoteStore;
  transferStore: InMemoryTransferStore;
  quotes: TransferQuoteService;
  transfers: TransferService;
  execute: InternalTransferUseCase;
  balances: BalanceService;
  projector: RecordingProjector;
  stepUp: RecordingStepUp;
  fees: StubFeeService;
  limits: StubLimitsService;
  ledger: LedgerRig;
  clock: ClockService;
  runner: TransactionRunner;
}

/** Wires the lane. `product` sets the terms every account in the rig is priced on. */
export function transfersRig(product?: Product): TransfersRig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const runner = retryingRunner();
  const ledger = ledgerRigFor(accounts, clock, runner);

  const directory = new InMemoryPayeeDirectory();
  const payees = new PayeeResolverService(accounts, directory);
  const beneficiaries = new BeneficiaryService(
    new InMemoryBeneficiaryStore(new IdGenerator()),
    new ResolverPayeeNameAdapter(payees),
    clock,
  );

  const parts = buildServices({ accounts, clock, runner, payees, beneficiaries, product });
  const booking = new TransferBookingService(
    ledger.postings,
    parts.projector as unknown as TransactionProjectorService,
    parts.transferStore,
    clock,
  );

  return {
    accounts,
    beneficiaries,
    directory,
    ledger,
    clock,
    runner,
    ...parts,
    transfers: new TransferService(parts.transferStore, clock),
    execute: new InternalTransferUseCase(
      new TransferExecutionService(parts.quotes, parts.pricing, parts.guard, booking),
      parts.transferStore,
      runner,
    ),
  };
}

/** The services and stubs, built together so the rig factory stays readable. */
function buildServices(input: {
  accounts: InMemoryAccountStore;
  clock: ClockService;
  runner: TransactionRunner;
  payees: PayeeResolverService;
  beneficiaries: BeneficiaryService;
  product: Product | undefined;
}) {
  const trust = new PayeeTrustService(input.beneficiaries, input.clock);
  const fees = new StubFeeService();
  const limits = new StubLimitsService();
  const stepUp = new RecordingStepUp();
  const balances = new BalanceService(input.accounts, input.clock);

  const pricing = new TransferPricingService(
    new AccountService(input.accounts, input.clock, input.runner),
    input.payees,
    new StubProductService(input.product) as unknown as ProductService,
    fees as unknown as FeeService,
  );

  const guard = new TransferGuardService(
    balances,
    limits as unknown as LimitsService,
    trust,
    stepUp,
  );

  const quoteStore = new InMemoryQuoteStore(new IdGenerator());

  return {
    trust,
    fees,
    limits,
    stepUp,
    balances,
    pricing,
    guard,
    quoteStore,
    transferStore: new InMemoryTransferStore(new IdGenerator()),
    projector: new RecordingProjector(),
    quotes: new TransferQuoteService(pricing, guard, quoteStore, input.clock),
  };
}

/** GBP minor units in the wire shape a quote request carries. */
export function gbpWire(minor: string) {
  return Money.fromMinor(minor, 'GBP').toJSON();
}

/** A flat fee schedule entry, for the tests that prove the fee leg is booked. */
export function flatFee(kind: FeeKind, minor: string): Product['fees'][number] {
  return {
    kind,
    label: 'Transfer fee',
    flatAmount: { amount: minor, currency: 'GBP' },
    rateBps: null,
    minAmount: null,
    maxAmount: null,
    freeAllowancePerMonth: 0,
    waivedForTiers: [],
  };
}
