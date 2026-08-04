/**
 * The vault: the one place money moves into and out of a savings goal.
 *
 * Every path that changes a vault balance — a manual contribution, a round-up, an
 * auto-save, a withdrawal, closing a goal — goes through here, so the ledger entry and the
 * stored balance are written by the same code in the same order. A second implementation
 * of "add to a vault" is how a goal balance and the general ledger stop agreeing.
 *
 * ## Why every movement is one transaction over one read
 *
 * A vault movement is four steps — read the vault, check it, post the entry, write the new
 * balance — and they are only correct as a single unit. Splitting them is not a
 * theoretical risk, it is the defect this file was rewritten to close: `debit` used to
 * check a `GoalRecord` handed in by its caller, post with no session, then write an
 * absolute balance derived from that same pre-call read. Two withdrawals racing each
 * passed the check, derived the *same* ledger reference from the same stale movement count
 * — so the second posting deduped into the first and moved no money — and the second
 * balance write overwrote the first. The vault then held money the ledger had never
 * funded, and that difference was spendable.
 *
 * So: the goal is re-read **inside** the session, the posting joins that session, and the
 * balance is written conditionally on the figure it was computed from. A read that omits
 * the session escapes the snapshot and is that same bug in miniature.
 *
 * `TransactionRunner` re-runs the whole callback on a write conflict, which under
 * concurrent movements on one goal is normal rather than exceptional. Everything below is
 * therefore safe to run twice: it reads inside the session, writes nothing outside it, and
 * keeps no state that outlives the transaction.
 */

import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { type JournalEntry } from '../../domain/ledger/index.js';
import { BalanceService } from '../holds/index.js';
import { PostingService } from '../ledger/posting.service.js';

import { VaultWriteConflictError } from './goal-concurrency.js';
import { goalEntries } from './goal-entries.js';
import { GOAL_REFERENCE_PREFIX, GOAL_TRANSACTION_LABEL } from './goal.constants.js';
import { GoalStore, type GoalRecord } from './goal.store.js';

/** Why money is moving. Drives the entry type and the statement narrative. */
export const VaultMovement = {
  CONTRIBUTION: 'CONT',
  ROUND_UP: 'RUP',
  AUTO_SAVE: 'AUTO',
  WITHDRAWAL: 'WDR',
} as const;
export type VaultMovement = (typeof VaultMovement)[keyof typeof VaultMovement];

const NARRATIVE: Readonly<Record<VaultMovement, string>> = Object.freeze({
  [VaultMovement.CONTRIBUTION]: 'Added to savings',
  [VaultMovement.ROUND_UP]: 'Round-up to savings',
  [VaultMovement.AUTO_SAVE]: 'Automatic saving',
  [VaultMovement.WITHDRAWAL]: 'Withdrawn from savings',
});

/** Which way the money is going. Decides the entry, the sign, and what gets checked. */
const Direction = { IN: 'IN', OUT: 'OUT' } as const;
type Direction = (typeof Direction)[keyof typeof Direction];

/**
 * What a caller asks the vault to do.
 *
 * A goal *id*, never a `GoalRecord`. A record carries a balance read at some earlier
 * moment, and accepting one would invite exactly the arithmetic that broke this file —
 * the only trustworthy read is the one taken inside the transaction below.
 */
export interface VaultRequest {
  readonly goalId: string;
  readonly amount: Money;
  /** Join a caller's transaction instead of opening one. */
  readonly session?: ClientSession;
}

@Injectable()
export class GoalVaultService {
  constructor(
    private readonly goals: GoalStore,
    private readonly postings: PostingService,
    private readonly balances: BalanceService,
    private readonly runner: TransactionRunner,
    private readonly clock: ClockService,
  ) {}

  /**
   * Moves money into a goal's vault.
   *
   * Contributions past the target are allowed. A customer who saves £1,050 toward a
   * £1,000 holiday has not made a mistake, and refusing the last fifty pounds because a
   * progress bar cannot exceed 100% would be the software's problem, not theirs.
   *
   * @throws {AppError} `INSUFFICIENT_FUNDS` when the linked account cannot cover it,
   *   `NOT_FOUND` when the goal is gone or closed.
   */
  async credit(input: VaultRequest & { movement: VaultMovement }): Promise<GoalRecord> {
    return this.move({ ...input, direction: Direction.IN });
  }

  /**
   * Moves money out of a goal's vault and back to the linked account.
   *
   * @throws {AppError} `INSUFFICIENT_FUNDS` when the vault does not hold that much. The
   *   check is against the vault, not the account: the money is already the customer's,
   *   and they simply cannot take out more than they put in.
   */
  async debit(input: VaultRequest): Promise<GoalRecord> {
    return this.move({
      ...input,
      movement: VaultMovement.WITHDRAWAL,
      direction: Direction.OUT,
    });
  }

  /**
   * Empties a vault back into the linked account, whatever is in it.
   *
   * Closing a goal reads the balance and returns it in one transaction, rather than the
   * caller reading it and asking for that amount back: a contribution landing between
   * those two steps would strand money in a vault nothing points at any more.
   */
  async drain(input: { goalId: string; session?: ClientSession }): Promise<GoalRecord> {
    return this.runner.runIn(
      input.session,
      async (session) => {
        const goal = await this.requireOpen(input.goalId, session);
        const balance = fromStored(goal.currentAmount);
        if (!balance.isPositive) return goal;

        return this.moveWithin(
          { goal, amount: balance, movement: VaultMovement.WITHDRAWAL, direction: Direction.OUT },
          session,
        );
      },
      { label: GOAL_TRANSACTION_LABEL.VAULT_MOVEMENT },
    );
  }

  /** Opens the transaction the movement runs in, or joins the caller's. */
  private async move(
    input: VaultRequest & { movement: VaultMovement; direction: Direction },
  ): Promise<GoalRecord> {
    // Nothing to move and nothing to book. Costs one read rather than a transaction.
    if (!input.amount.isPositive) return this.requireOpen(input.goalId);

    return this.runner.runIn(
      input.session,
      async (session) => {
        const goal = await this.requireOpen(input.goalId, session);
        return this.moveWithin({ ...input, goal }, session);
      },
      { label: GOAL_TRANSACTION_LABEL.VAULT_MOVEMENT },
    );
  }

  /**
   * The transactional body: check, post, settle, all from the one read of `goal`.
   *
   * The order matters. The funds check runs first so a refusal costs no writes; the
   * posting is written before the balance so that at every instant a concurrent reader
   * could observe, the vault figure is backed by a journal entry rather than the reverse.
   */
  private async moveWithin(input: MovementContext, session: ClientSession): Promise<GoalRecord> {
    const { goal, amount, direction } = input;
    const balance = fromStored(goal.currentAmount);

    await this.assertFunded(input, session);
    await this.postings.post(
      entryFor(input, this.reference(goal, input.movement), this.clock),
      session,
    );

    return this.settle({
      goal,
      balance: direction === Direction.OUT ? balance.minus(amount) : balance.plus(amount),
      session,
    });
  }

  /**
   * Refuses a movement nothing can pay for, before anything is written.
   *
   * Money going in is checked against the linked account through `BalanceService`, inside
   * the session, so the answer is about the balance this transaction will actually spend.
   * The ledger enforces its own floor underneath — that is the backstop, not the check.
   * Doing it here means the customer is told which account is short and by how much,
   * instead of an aborted transaction and a generic refusal.
   *
   * Money coming out is checked against the vault, which holds the customer's own money.
   */
  private async assertFunded(input: MovementContext, session: ClientSession): Promise<void> {
    if (input.direction === Direction.IN) {
      await this.balances.assertSufficientFunds(input.goal.linkedAccountId, input.amount, session);
      return;
    }

    const balance = fromStored(input.goal.currentAmount);
    if (!input.amount.greaterThan(balance)) return;

    throw new AppError({
      code: ErrorCode.INSUFFICIENT_FUNDS,
      message:
        `There is ${balance.format()} in this goal, so we could not move ` +
        `${input.amount.format()} back to your account.`,
      context: { goalId: input.goal.id },
    });
  }

  /**
   * Writes the new vault balance and stamps completion the first time the target is met.
   *
   * The write is conditional on the balance and movement count it was computed from, so a
   * goal that moved since the read at the top of this transaction rejects it rather than
   * flattening someone else's contribution with a stale absolute. A rejection raises
   * `VaultWriteConflictError`, which aborts the transaction and has `TransactionRunner`
   * run the whole movement again against the balance that is really there.
   *
   * `completedAt` is set once and never cleared by a later withdrawal: the customer did
   * reach their target, and un-completing a goal because they dipped into it afterwards
   * would erase something worth celebrating.
   */
  private async settle(input: {
    goal: GoalRecord;
    balance: Money;
    session: ClientSession;
  }): Promise<GoalRecord> {
    const { goal, balance } = input;
    const reachedTarget = balance.greaterThanOrEqual(fromStored(goal.targetAmount));

    const updated = await this.goals.applyVaultMovement({
      goalId: goal.id,
      expected: goal.currentAmount,
      expectedMovementCount: goal.movementCount,
      balance: toStored(balance),
      completedAt: goal.completedAt ?? (reachedTarget ? this.clock.now() : null),
      session: input.session,
    });

    if (!updated) throw new VaultWriteConflictError(goal.id);
    return updated;
  }

  /**
   * The unique reference this movement books under.
   *
   * `movementCount` is what makes it unique, and it is read in the same transaction that
   * increments it. That pairing is the whole idempotency story: a retry re-reads the
   * count and derives a fresh reference, while a replay of work already committed derives
   * the reference that is already in the journal and is discarded by `PostingService`.
   */
  private reference(goal: GoalRecord, movement: VaultMovement): string {
    const sequence = String(goal.movementCount + 1);
    return [GOAL_REFERENCE_PREFIX, goal.id, movement, this.clock.today(), sequence].join('-');
  }

  private async requireOpen(goalId: string, session?: ClientSession): Promise<GoalRecord> {
    const goal = await this.goals.findById(goalId, session);
    // Undefined and closed answer the same way: there is no vault here to move.
    if (goal?.closedAt !== null) throw goalVanished(goalId);
    return goal;
  }
}

/** One movement, as the transactional body sees it. */
interface MovementContext {
  readonly goal: GoalRecord;
  readonly amount: Money;
  readonly movement: VaultMovement;
  readonly direction: Direction;
}

/** The journal entry a movement books. Round-ups are typed apart from contributions. */
function entryFor(input: MovementContext, reference: string, clock: ClockService): JournalEntry {
  const asOf = clock.today();
  const envelope = {
    reference,
    accountId: input.goal.linkedAccountId,
    amount: input.amount,
    description: `${NARRATIVE[input.movement]} — ${input.goal.name}`,
    valueDate: asOf,
    bookedAt: clock.now(),
    metadata: { goalId: input.goal.id },
  };

  if (input.direction === Direction.OUT) return goalEntries.withdrawal(envelope);
  return input.movement === VaultMovement.ROUND_UP
    ? goalEntries.roundUp(envelope)
    : goalEntries.contribution(envelope);
}

function goalVanished(goalId: string): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: 'We could not find that savings goal.',
    context: { goalId },
  });
}
