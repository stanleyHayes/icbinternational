import { AccountStatus, AccountType, ErrorCode, TransferStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { AccountNumberService, AccountService } from '../../accounts/index.js';
import {
  BeneficiaryService,
  InMemoryPayeeDirectory,
  PayeeResolverService,
  PayeeTrustService,
  ResolverPayeeNameAdapter,
} from '../../beneficiaries/index.js';
import { BalanceService } from '../../holds/index.js';
import { type FeeService, type LimitsService, type ProductService } from '../../products/index.js';
import { type TransactionProjectorService } from '../../transactions/transaction-projector.service.js';
import { InternalTransferUseCase } from '../internal-transfer.use-case.js';
import { TransferBookingService } from '../transfer-booking.service.js';
import { TransferExecutionService } from '../transfer-execution.service.js';
import { TransferGuardService } from '../transfer-guard.service.js';
import { TransferPricingService } from '../transfer-pricing.service.js';
import { TransferQuoteService } from '../transfer-quote.service.js';
import { type TransferRecord } from '../transfer.store.js';

import { mongoRig, replicaSetAvailable, type MongoRig } from './mongo-rig.js';
import {
  RecordingProjector,
  RecordingStepUp,
  StubFeeService,
  StubLimitsService,
  StubProductService,
} from './transfers-stubs.js';

const SENDER = 'usr_01JQ8Z00000000000SENDER01';
const PAYEE = 'usr_01JQ8Z000000000000PAYEE01';
const STEP_UP = 'step-up-proof';

/** Twelve simultaneous £80 payments against an account holding £500. */
const CONCURRENT_TRANSFERS = 12;
const TRANSFER_MINOR = '8000';
const OPENING_MINOR = '50000';
const SUITE_TIMEOUT_MS = 60_000;

/**
 * Concurrent transfers against a real MongoDB replica set.
 *
 * Everything else in this lane runs against in-memory stores that reproduce the same rules
 * in milliseconds. This suite exists because one thing cannot be reproduced in memory: the
 * server's own conflict detection inside a snapshot-isolated multi-document transaction.
 * Twelve simultaneous authorisations from one account is precisely the scenario where a
 * funds check and a debit that were not one atomic unit would let two payments both take
 * the last of the money — and only the real server can prove they do not.
 *
 * Two invariants are asserted after the storm:
 *
 * 1. **The account is never overdrawn past its limit.** Some payments succeed and some are
 *    refused `INSUFFICIENT_FUNDS`; what must never happen is that the sum of the successes
 *    exceeds what the account could cover.
 * 2. **The book still balances.** Every journal entry written is re-summed per currency,
 *    and the two customer balances are re-derived from the postings and compared with the
 *    stored projections. A transfer that moved money without a balanced entry, or wrote a
 *    projection the journal does not support, fails here.
 *
 * The suite skips itself — loudly — when no replica set is reachable, so a contributor
 * without Docker gets a clear message rather than a wall of connection errors.
 */
describe('concurrent internal transfers against a real replica set', () => {
  let rig: MongoRig | null = null;
  let available = false;

  beforeAll(async () => {
    available = await replicaSetAvailable();
    if (!available) {
      console.warn(
        'Skipping the transfer concurrency suite: no MongoDB replica set at the configured ' +
          'URI. Run `docker compose -f infra/docker/docker-compose.yml up -d mongo`.',
      );
      return;
    }
    rig = await mongoRig('transfers');
  }, SUITE_TIMEOUT_MS);

  afterAll(async () => {
    await rig?.close();
  });

  it(
    'never overdraws the account and leaves the book balanced',
    async () => {
      if (!rig) return;
      const lane = buildLane(rig);
      const { from, to } = await twoAccounts(rig);

      const quotes = await Promise.all(
        Array.from({ length: CONCURRENT_TRANSFERS }, () =>
          lane.quotes.quote({
            userId: SENDER,
            request: {
              sourceAccountId: from,
              destination: { kind: 'INTERNAL', accountId: to },
              amount: Money.fromMinor(TRANSFER_MINOR, 'GBP').toJSON(),
              amountIsReceiveSide: false,
              chargeBearer: 'SHA',
            },
          }),
        ),
      );

      const outcomes = await Promise.allSettled(
        quotes.map((quote) =>
          lane.execute.execute({
            userId: SENDER,
            stepUpToken: STEP_UP,
            request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
          }),
        ),
      );

      const settled = outcomes.filter(
        (outcome) => outcome.status === 'fulfilled',
      ) as PromiseFulfilledResult<TransferRecord>[];

      expect(settled.length).toBeGreaterThan(0);
      expect(settled.every((outcome) => outcome.value.status === TransferStatus.SETTLED)).toBe(
        true,
      );
      expectOnlyContentionRefusals(outcomes);

      const moved = BigInt(settled.length) * BigInt(TRANSFER_MINOR);
      expect(moved).toBeLessThanOrEqual(BigInt(OPENING_MINOR));

      const sender = await rig.accounts.findById(from);
      const payee = await rig.accounts.findById(to);
      expect(sender?.ledgerBalance.amount).toBe((BigInt(OPENING_MINOR) - moved).toString());
      expect(payee?.ledgerBalance.amount).toBe(moved.toString());
      expect(BigInt(sender?.ledgerBalance.amount ?? '0')).toBeGreaterThanOrEqual(0n);

      await expectBookBalances(rig, { from, to });
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'books one transfer and one debit when the same quote is authorised twice at once',
    async () => {
      if (!rig) return;
      const lane = buildLane(rig);
      const { from, to } = await twoAccounts(rig);

      const quote = await lane.quotes.quote({
        userId: SENDER,
        request: {
          sourceAccountId: from,
          destination: { kind: 'INTERNAL', accountId: to },
          amount: Money.fromMinor(TRANSFER_MINOR, 'GBP').toJSON(),
          amountIsReceiveSide: false,
          chargeBearer: 'SHA',
        },
      });

      const authorised = {
        userId: SENDER,
        stepUpToken: STEP_UP,
        request: { quoteId: quote.id, saveBeneficiary: false, metadata: {} },
      };

      const results = await Promise.allSettled([
        lane.execute.execute(authorised),
        lane.execute.execute(authorised),
      ]);

      const ids = new Set(
        results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => (result as PromiseFulfilledResult<{ id: string }>).value.id),
      );

      expect(ids.size).toBe(1);

      const sender = await rig.accounts.findById(from);
      expect(sender?.ledgerBalance.amount).toBe(
        (BigInt(OPENING_MINOR) - BigInt(TRANSFER_MINOR)).toString(),
      );
    },
    SUITE_TIMEOUT_MS,
  );
});

/** Wires the transfer lane over the rig's Mongo-backed collaborators. */
function buildLane(rig: MongoRig) {
  const directory = new InMemoryPayeeDirectory().register({
    userId: PAYEE,
    email: 'payee@example.com',
    displayName: 'Ada Lovelace',
  });

  const payees = new PayeeResolverService(rig.accounts, directory);
  const trust = new PayeeTrustService(
    new BeneficiaryService(rig.beneficiaries, new ResolverPayeeNameAdapter(payees), rig.clock),
    rig.clock,
  );

  const pricing = new TransferPricingService(
    new AccountService(rig.accounts, rig.clock, rig.runner),
    payees,
    new StubProductService() as unknown as ProductService,
    new StubFeeService() as unknown as FeeService,
  );

  const guard = new TransferGuardService(
    new BalanceService(rig.accounts, rig.clock),
    new StubLimitsService() as unknown as LimitsService,
    trust,
    new RecordingStepUp().accept(SENDER, STEP_UP),
  );

  const quotes = new TransferQuoteService(pricing, guard, rig.quotes, rig.clock);
  const booking = new TransferBookingService(
    rig.postings,
    new RecordingProjector() as unknown as TransactionProjectorService,
    rig.transfers,
    rig.clock,
  );

  return {
    quotes,
    execute: new InternalTransferUseCase(
      new TransferExecutionService(quotes, pricing, guard, booking),
      rig.transfers,
      rig.runner,
    ),
  };
}

/** A funded sender and an empty payee, both minted with real Reliance identifiers. */
async function twoAccounts(rig: MongoRig) {
  const from = await openAccount(rig, SENDER, OPENING_MINOR);
  const to = await openAccount(rig, PAYEE, '0');
  return { from, to };
}

const ids = new IdGenerator();
let serial = 20_000_000;

async function openAccount(rig: MongoRig, userId: string, minor: string): Promise<string> {
  serial += 1;
  const identifiers = new AccountNumberService(rig.accounts, {
    countryCode: 'GB',
    bankCode: 'RLNC',
    sortCode: '049921',
  }).identifiersFor(String(serial).padStart(8, '0'));

  const zero = toStored(Money.zero('GBP'));
  const result = await rig.accounts.insert({
    id: ids.generate('account'),
    userId,
    holderIds: [userId],
    type: AccountType.CURRENT,
    status: AccountStatus.ACTIVE,
    currency: 'GBP',
    productCode: 'EVERYDAY_CURRENT',
    productVersion: 1,
    productName: 'Everyday Current',
    nickname: null,
    number: identifiers.number,
    sortCode: identifiers.sortCode,
    iban: identifiers.iban,
    ledgerBalance: toStored(Money.fromMinor(minor, 'GBP')),
    availableBalance: toStored(Money.fromMinor(minor, 'GBP')),
    holdTotal: zero,
    overdraftLimit: zero,
    minimumOpeningBalance: zero,
    interestRateBps: null,
    isPrimary: true,
    openedAt: rig.clock.now(),
  });

  if (!result.account) throw new Error(`Fixture account collided on ${result.conflictOn}`);
  return result.account.id;
}

/**
 * The only two refusals contention may produce. Anything else is a defect.
 *
 * `INSUFFICIENT_FUNDS` is the expected outcome once the account is spent. `CONFLICT` is
 * `TransactionRunner` giving up after its retry budget, which is what a real bank returns
 * under a burst this dense — twelve authorisations against one document is far past normal
 * load, and telling the twelfth caller "try again in a moment" is honest. What matters is
 * that neither outcome ever coincides with money having moved: a refused payment aborts its
 * transaction, so the balance assertions below hold regardless of the split.
 */
function expectOnlyContentionRefusals(outcomes: readonly PromiseSettledResult<unknown>[]): void {
  const acceptable: readonly string[] = [ErrorCode.INSUFFICIENT_FUNDS, ErrorCode.CONFLICT];

  const codes = outcomes
    .filter((outcome) => outcome.status === 'rejected')
    .map((outcome) => String((outcome as PromiseRejectedResult).reason?.code));

  for (const code of codes) expect(acceptable).toContain(code);
}

/**
 * Re-derives both customer balances from the journal and compares them with the stored ones.
 *
 * This is the assertion that would catch a transfer that moved a projection without a
 * balanced entry behind it — the exact failure double-entry exists to make impossible.
 */
async function expectBookBalances(
  rig: MongoRig,
  accounts: { from: string; to: string },
): Promise<void> {
  const entries = await rig.connection.collection('journal_entries').find({}).toArray();
  const postings = entries.flatMap((entry) => entry['postings'] as PostingShape[]);

  expect(sumWhere(postings, 'DEBIT')).toBe(sumWhere(postings, 'CREDIT'));

  const sender = await rig.accounts.findById(accounts.from);
  const payee = await rig.accounts.findById(accounts.to);

  expect(BigInt(sender?.ledgerBalance.amount ?? '0') - BigInt(OPENING_MINOR)).toBe(
    netEffectOn(postings, accounts.from),
  );
  expect(BigInt(payee?.ledgerBalance.amount ?? '0')).toBe(netEffectOn(postings, accounts.to));
}

/** Total of every posting on one side, across every entry written. */
function sumWhere(postings: readonly PostingShape[], direction: string): bigint {
  return postings
    .filter((posting) => posting.direction === direction)
    .reduce((total, posting) => total + BigInt(posting.amount.amount), 0n);
}

/**
 * What the journal says one customer's balance moved by.
 *
 * A credit to `CUSTOMER_DEPOSITS` raises what the customer sees and a debit lowers it —
 * customer accounts are liabilities of the bank — which is why the sign looks inverted.
 */
function netEffectOn(postings: readonly PostingShape[], accountId: string): bigint {
  return postings
    .filter((posting) => posting.accountId === accountId)
    .reduce((total, posting) => {
      const amount = BigInt(posting.amount.amount);
      return total + (posting.direction === 'CREDIT' ? amount : -amount);
    }, 0n);
}

interface PostingShape {
  accountId: string | null;
  direction: string;
  amount: { amount: string };
}
