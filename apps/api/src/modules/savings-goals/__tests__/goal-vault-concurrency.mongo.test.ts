import { ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AccountService } from '../../accounts/index.js';
import { GoalVaultService } from '../goal-vault.service.js';
import { GoalService } from '../goal.service.js';

import { goalRig, openAccount, replicaSetAvailable, type GoalRig } from './goal-mongo-rig.js';

const OWNER = 'usr_01JQ8Z0000000000000SAVER1';
const GBP = 'GBP';

/** £1,000 in the current account, £500 of it moved into the vault before the storm. */
const OPENING_MINOR = '100000';
const FUNDED_MINOR = '50000';

/** Five simultaneous withdrawals of five different amounts. */
const WITHDRAWAL_MINORS = ['1000', '2000', '3000', '4000', '5000'];

/** Five simultaneous contributions, all of them affordable together. */
const CONTRIBUTION_MINORS = ['1100', '2200', '3300', '4400', '5500'];

/** The general-ledger account a savings vault is held against. */
const VAULT_GL_CODE = '2400';

const SUITE_TIMEOUT_MS = 60_000;

/**
 * Concurrent vault movements against a real MongoDB replica set.
 *
 * This suite exists because of a specific defect. `GoalVaultService.debit` used to check a
 * `GoalRecord` its caller had read earlier, post with no session, and then write the new
 * balance as an **absolute** figure derived from that same stale read. Two withdrawals
 * racing therefore both passed the check, both derived the *same* ledger reference from
 * the same stale movement count — so the second posting deduped into the first and moved
 * no money at all — and the second balance write flattened the first. The vault was left
 * holding money the ledger had never funded, and that difference was spendable.
 *
 * The invariant that catches it is the only one worth asserting here:
 *
 * > **A goal's `currentAmount` equals the sum of the postings against its vault. Exactly.**
 *
 * Nothing about a mutex or a retry count is asserted, because neither is the property that
 * matters. Real concurrent calls go through the real service against the real server, and
 * the books are re-derived from the journal afterwards.
 *
 * The suite skips itself — loudly — when no replica set is reachable, so a contributor
 * without Docker gets a clear message rather than a wall of connection errors.
 */
describe('concurrent savings vault movements against a real replica set', () => {
  let rig: GoalRig | null = null;

  beforeAll(async () => {
    if (!(await replicaSetAvailable())) {
      console.warn(
        'Skipping the savings vault concurrency suite: no MongoDB replica set at the ' +
          'configured URI. Run `docker compose -f infra/docker/docker-compose.yml up -d mongo`.',
      );
      return;
    }
    rig = await goalRig();
  }, SUITE_TIMEOUT_MS);

  afterAll(async () => {
    await rig?.close();
  });

  it(
    'keeps the vault equal to its postings under simultaneous withdrawals',
    async () => {
      if (!rig) return;
      const lane = buildLane(rig);
      const goalId = await fundedGoal(rig, lane);

      const outcomes = await Promise.allSettled(
        WITHDRAWAL_MINORS.map((minor) =>
          lane.goals.withdraw({
            userId: OWNER,
            goalId,
            request: { amount: Money.fromMinor(minor, GBP).toJSON() },
          }),
        ),
      );

      expectOnlyContentionRefusals(outcomes);
      // At least two must have landed, or the race the suite exists to reproduce did not
      // happen and a green result would mean nothing.
      expect(fulfilled(outcomes)).toBeGreaterThanOrEqual(2);

      await expectVaultMatchesPostings(rig, goalId);
      await expectAccountMatchesPostings(rig, goalId);
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'keeps the vault equal to its postings under simultaneous contributions',
    async () => {
      if (!rig) return;
      const lane = buildLane(rig);
      const goalId = await fundedGoal(rig, lane);

      const outcomes = await Promise.allSettled(
        CONTRIBUTION_MINORS.map((minor) =>
          lane.goals.contribute({
            userId: OWNER,
            goalId,
            request: { amount: Money.fromMinor(minor, GBP).toJSON() },
          }),
        ),
      );

      expectOnlyContentionRefusals(outcomes);
      expect(fulfilled(outcomes)).toBeGreaterThanOrEqual(2);

      await expectVaultMatchesPostings(rig, goalId);
      await expectAccountMatchesPostings(rig, goalId);
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'books one entry per movement rather than deduping racing movements into one',
    async () => {
      if (!rig) return;
      const lane = buildLane(rig);
      const goalId = await fundedGoal(rig, lane);

      const outcomes = await Promise.allSettled(
        WITHDRAWAL_MINORS.map((minor) =>
          lane.goals.withdraw({
            userId: OWNER,
            goalId,
            request: { amount: Money.fromMinor(minor, GBP).toJSON() },
          }),
        ),
      );

      // Every movement that reported success must have its own journal entry. The old
      // reference — derived from a movement count read before the race — collided, and a
      // colliding reference is silently reused by `PostingService`.
      // Plus one for the contribution that funded the vault before the storm.
      const entries = await goalEntries(rig, goalId);
      expect(entries).toHaveLength(fulfilled(outcomes) + 1);
    },
    SUITE_TIMEOUT_MS,
  );

  /**
   * The pre-flight funds check, tested where the ledger floor cannot answer.
   *
   * The floor in `MongoAccountBalancePort` compares against `ledgerBalance`, and held money
   * is still on the ledger — so a contribution funded out of a live card authorisation
   * sails straight past it. Only a caller that asks `BalanceService` what is actually
   * spendable can refuse this, which is why the vault asks before it posts. £900 of the
   * £1,000 here is held; the £500 contribution is affordable on the ledger and not
   * affordable in reality.
   */
  it(
    'refuses a contribution the linked account cannot spend, and books nothing',
    async () => {
      if (!rig) return;
      const lane = buildLane(rig);
      const accountId = await openAccount(rig, {
        userId: OWNER,
        minor: OPENING_MINOR,
        heldMinor: '90000',
      });
      const goal = await openGoal(lane, accountId);

      await expect(
        lane.goals.contribute({
          userId: OWNER,
          goalId: goal,
          request: { amount: Money.fromMinor(FUNDED_MINOR, GBP).toJSON() },
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_FUNDS,
        // Only the pre-flight names what is spendable against what was asked for. The
        // ledger floor reports the balance the posting would have left behind instead.
        context: { available: expect.anything(), requested: expect.anything() },
      });

      expect(await goalEntries(rig, goal)).toHaveLength(0);
      const account = await rig.accounts.findById(accountId);
      expect(account?.ledgerBalance.amount).toBe(OPENING_MINOR);
    },
    SUITE_TIMEOUT_MS,
  );
});

/** Wires the savings lane over the rig's Mongo-backed collaborators. */
function buildLane(rig: GoalRig) {
  const vault = new GoalVaultService(rig.goals, rig.postings, rig.balances, rig.runner, rig.clock);

  return {
    vault,
    goals: new GoalService(
      rig.goals,
      new AccountService(rig.accounts, rig.clock, rig.runner),
      vault,
      rig.runner,
      rig.clock,
    ),
  };
}

/** An empty goal on a fresh account. */
async function openGoal(lane: ReturnType<typeof buildLane>, accountId: string): Promise<string> {
  const goal = await lane.goals.create(OWNER, {
    name: 'Kyoto',
    targetAmount: Money.fromMinor('200000', GBP).toJSON(),
    linkedAccountId: accountId,
    roundUpsEnabled: false,
  });

  return goal.id;
}

/** A goal with £500 already in the vault, funded through the real contribution path. */
async function fundedGoal(rig: GoalRig, lane: ReturnType<typeof buildLane>): Promise<string> {
  const accountId = await openAccount(rig, { userId: OWNER, minor: OPENING_MINOR });
  const goalId = await openGoal(lane, accountId);

  await lane.goals.contribute({
    userId: OWNER,
    goalId,
    request: { amount: Money.fromMinor(FUNDED_MINOR, GBP).toJSON() },
  });

  return goalId;
}

function fulfilled(outcomes: readonly PromiseSettledResult<unknown>[]): number {
  return outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
}

/**
 * The only refusal contention may produce here.
 *
 * `CONFLICT` is `TransactionRunner` giving up after five attempts, which is honest under a
 * burst this dense against one document. `INSUFFICIENT_FUNDS` would be legitimate too if
 * the fixtures were tighter; they are not, so anything other than a conflict means a
 * movement failed for a reason this suite has not accounted for.
 */
function expectOnlyContentionRefusals(outcomes: readonly PromiseSettledResult<unknown>[]): void {
  const acceptable: readonly string[] = [ErrorCode.CONFLICT, ErrorCode.INSUFFICIENT_FUNDS];

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') continue;
    expect(acceptable).toContain(String(outcome.reason?.code));
  }
}

/** Every journal entry booked against one goal, newest last. */
async function goalEntries(rig: GoalRig, goalId: string): Promise<EntryShape[]> {
  const documents = await rig.connection
    .collection('journal_entries')
    .find({ 'metadata.goalId': goalId })
    .toArray();

  return documents as unknown as EntryShape[];
}

/**
 * The assertion the whole suite is for.
 *
 * Re-derives the vault balance from the general-ledger legs of the goal's own entries and
 * compares it with the stored figure. A movement that wrote a balance the journal does not
 * support — or a balance write that flattened one the journal does — fails here.
 */
async function expectVaultMatchesPostings(rig: GoalRig, goalId: string): Promise<void> {
  const entries = await goalEntries(rig, goalId);
  const postings = entries.flatMap((entry) => entry.postings);

  expect(sumWhere(postings, 'DEBIT')).toBe(sumWhere(postings, 'CREDIT'));

  const goal = await rig.goals.findById(goalId);
  expect(goal?.currentAmount.amount).toBe(vaultEffect(postings).toString());
}

/** The linked account's stored balance, re-derived from the same entries. */
async function expectAccountMatchesPostings(rig: GoalRig, goalId: string): Promise<void> {
  const goal = await rig.goals.findById(goalId);
  if (!goal) throw new Error(`Goal ${goalId} vanished`);

  const postings = (await goalEntries(rig, goalId)).flatMap((entry) => entry.postings);
  const account = await rig.accounts.findById(goal.linkedAccountId);

  expect(BigInt(account?.ledgerBalance.amount ?? '0') - BigInt(OPENING_MINOR)).toBe(
    customerEffect(postings, goal.linkedAccountId),
  );
  expect(BigInt(account?.ledgerBalance.amount ?? '0')).toBeGreaterThanOrEqual(0n);
}

/** Total of every posting on one side, across every entry written for the goal. */
function sumWhere(postings: readonly PostingShape[], direction: string): bigint {
  return postings
    .filter((posting) => posting.direction === direction)
    .reduce((total, posting) => total + BigInt(posting.amount.amount), 0n);
}

/**
 * What the journal says the vault holds.
 *
 * The vault is a liability of the bank, so a credit to `2400 Savings Vaults` raises it and
 * a debit lowers it — which is why the sign looks inverted next to a customer's intuition.
 */
function vaultEffect(postings: readonly PostingShape[]): bigint {
  return postings
    .filter((posting) => posting.ledgerAccountCode === VAULT_GL_CODE)
    .reduce((total, posting) => {
      const amount = BigInt(posting.amount.amount);
      return total + (posting.direction === 'CREDIT' ? amount : -amount);
    }, 0n);
}

/** What the journal says one customer balance moved by, for the same reason inverted. */
function customerEffect(postings: readonly PostingShape[], accountId: string): bigint {
  return postings
    .filter((posting) => posting.accountId === accountId)
    .reduce((total, posting) => {
      const amount = BigInt(posting.amount.amount);
      return total + (posting.direction === 'CREDIT' ? amount : -amount);
    }, 0n);
}

interface PostingShape {
  accountId: string | null;
  ledgerAccountCode: string;
  direction: string;
  amount: { amount: string };
}

interface EntryShape {
  reference: string;
  postings: PostingShape[];
}
