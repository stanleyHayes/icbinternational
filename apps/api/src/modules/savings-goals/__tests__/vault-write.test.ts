import { Money } from '@reliance/money';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type GoalRecord } from '../goal.store.js';
import { InMemoryGoalStore } from '../in-memory-goal.store.js';

/**
 * The conditional vault write, in isolation and in milliseconds.
 *
 * `goal-vault-concurrency.mongo.test.ts` proves the property that matters against a real
 * replica set. This suite pins the contract that makes it possible: a vault write lands
 * only on the balance it was computed from, and reports a lost race rather than
 * overwriting one. Every store must behave this way, so a fake that wrote unconditionally
 * would fail here rather than quietly making the rest of the savings tests meaningless.
 */

const GBP = 'GBP';
const OWNER = 'usr_01JQ8Z0000000000000SAVER1';

function money(minor: string): Money {
  return Money.fromMinor(minor, GBP);
}

async function seedGoal(store: InMemoryGoalStore, minor: string): Promise<GoalRecord> {
  return store.insert({
    userId: OWNER,
    name: 'Kyoto',
    emoji: null,
    targetAmount: toStored(money('200000')),
    currentAmount: toStored(money(minor)),
    targetDate: null,
    linkedAccountId: 'acc_01JQ8Z00000000000000ACC01',
    roundUpsEnabled: false,
    autoSave: null,
    startedOn: '2026-03-01',
    completedAt: null,
    closedAt: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    movementCount: 0,
  });
}

describe('applyVaultMovement', () => {
  let store: InMemoryGoalStore;

  beforeEach(() => {
    store = new InMemoryGoalStore(new IdGenerator());
  });

  it('writes the balance and advances the movement count together', async () => {
    const goal = await seedGoal(store, '50000');

    const updated = await store.applyVaultMovement({
      goalId: goal.id,
      expected: goal.currentAmount,
      expectedMovementCount: goal.movementCount,
      balance: toStored(money('45000')),
      completedAt: null,
    });

    expect(updated?.currentAmount.amount).toBe('45000');
    // The count is what makes the next movement's ledger reference unique. A balance that
    // moved without it would let two same-day movements collide on one journal entry.
    expect(updated?.movementCount).toBe(1);
  });

  it('refuses a write computed from a balance that has since moved', async () => {
    const goal = await seedGoal(store, '50000');
    const stale = goal.currentAmount;

    await store.applyVaultMovement({
      goalId: goal.id,
      expected: stale,
      expectedMovementCount: 0,
      balance: toStored(money('49000')),
      completedAt: null,
    });

    // The second movement was computed from £500 and would write £480 — flattening the
    // £10 the first one took out. It must not land.
    const loser = await store.applyVaultMovement({
      goalId: goal.id,
      expected: stale,
      expectedMovementCount: 0,
      balance: toStored(money('48000')),
      completedAt: null,
    });

    expect(loser).toBeNull();
    expect((await store.findById(goal.id))?.currentAmount.amount).toBe('49000');
  });

  it('refuses a write whose movement count is stale even when the balance agrees', async () => {
    const goal = await seedGoal(store, '50000');

    // A contribution and a withdrawal of the same size have left the balance where it
    // started. The balance alone cannot tell the two moments apart; the count can.
    await store.applyVaultMovement({
      goalId: goal.id,
      expected: goal.currentAmount,
      expectedMovementCount: 0,
      balance: toStored(money('50000')),
      completedAt: null,
    });

    const loser = await store.applyVaultMovement({
      goalId: goal.id,
      expected: goal.currentAmount,
      expectedMovementCount: 0,
      balance: toStored(money('40000')),
      completedAt: null,
    });

    expect(loser).toBeNull();
  });

  it('refuses to move a vault on a goal that has been closed', async () => {
    const goal = await seedGoal(store, '50000');
    await store.patch(goal.id, { closedAt: new Date('2026-03-02T09:00:00.000Z') });

    const written = await store.applyVaultMovement({
      goalId: goal.id,
      expected: goal.currentAmount,
      expectedMovementCount: goal.movementCount,
      balance: toStored(money('60000')),
      completedAt: null,
    });

    expect(written).toBeNull();
  });

  it('refuses a write against a goal that is not there', async () => {
    const written = await store.applyVaultMovement({
      goalId: 'gol_01JQ8Z0000000000000000MISS',
      expected: toStored(money('0')),
      expectedMovementCount: 0,
      balance: toStored(money('100')),
      completedAt: null,
    });

    expect(written).toBeNull();
  });
});

describe('GoalPatchFields', () => {
  it('cannot reach the vault', async () => {
    const store = new InMemoryGoalStore(new IdGenerator());
    const goal = await seedGoal(store, '50000');

    // `currentAmount` and `movementCount` are absent from the patch surface by design, so
    // this is a compile-time guarantee first and a runtime one second. The cast is what a
    // caller reaching for the old escape hatch would have to write, and it still fails.
    const patched = await store.patch(goal.id, {
      name: 'Kyoto, spring',
      ...({ currentAmount: toStored(money('999999')), movementCount: 99 } as object),
    });

    expect(patched?.name).toBe('Kyoto, spring');
    expect(patched?.currentAmount.amount).toBe('50000');
    expect(patched?.movementCount).toBe(0);
  });
});
