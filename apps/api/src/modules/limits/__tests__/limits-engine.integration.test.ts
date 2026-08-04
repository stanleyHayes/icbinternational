import { randomUUID } from 'node:crypto';

import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';

import { ErrorCode, KycTier, type LimitMatrix } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { LimitRule, LimitsService } from '../../products/index.js';
import { UsageCounterRepository } from '../../products/usage-counter.repository.js';
import {
  UsageCounterSchema,
  UsageCounterSchemaClass,
} from '../../products/usage-counter.schema.js';
import { LimitOverrideRepository } from '../limit-override.repository.js';
import { LimitOverrideSchema, LimitOverrideSchemaClass } from '../limit-override.schema.js';
import { LimitOverrideService } from '../limit-override.service.js';
import { LimitsEngineService, type LimitCheckInput } from '../limits-engine.service.js';

/**
 * The engine against a real replica set.
 *
 * The unit suites prove the table and the resolution order; this suite proves the
 * things only Mongo can: the atomic counter under concurrency, the timezone-correct
 * reset instant, and that an override granted through the service really does move the
 * line the engine enforces — until it expires.
 *
 * Providers are wired by hand rather than by importing `LimitsModule`, which keeps the
 * suite to the engine: a module import compiles controllers and their guards, and none of
 * that HTTP surface is what these assertions are about. (`ProductsModule` could not be
 * imported standalone at all when this was written — its admin controller had no way to
 * resolve the RBAC token service. That is fixed; the hand-wiring stays because the
 * narrower graph is the right one for a suite about counter arithmetic.)
 */

process.env.NODE_ENV = 'test';
// `127.0.0.1` rather than `localhost`: see the products integration suite.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27317/?replicaSet=rs0';

jest.setTimeout(240_000);

const DB_NAME = 'reliancebank_limits_test';
// 22:30 UTC is 23:30 in Europe/London (BST): local midnight falls at 23:00 UTC, which is
// what makes the timezone assertions below meaningful rather than tautological.
const NOW = new Date('2026-08-03T22:30:00.000Z');
const HOUR_MS = 3_600_000;

const DAILY_1000: LimitMatrix = {
  perTransaction: null,
  daily: { amount: '100000', currency: 'GBP' },
  monthly: null,
  dailyCount: null,
};

describe('the limits engine, against a replica set', () => {
  let moduleRef: TestingModule;
  let clock: ClockService;
  let engine: LimitsEngineService;
  let overrides: LimitOverrideService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(process.env.MONGODB_URI as string, { dbName: DB_NAME }),
        MongooseModule.forFeature([
          { name: UsageCounterSchemaClass.name, schema: UsageCounterSchema },
          { name: LimitOverrideSchemaClass.name, schema: LimitOverrideSchema },
        ]),
        ClockModule,
      ],
      providers: [
        UsageCounterRepository,
        LimitsService,
        LimitOverrideRepository,
        LimitOverrideService,
        LimitsEngineService,
      ],
    }).compile();

    clock = moduleRef.get(ClockService);
    engine = moduleRef.get(LimitsEngineService);
    overrides = moduleRef.get(LimitOverrideService);
    clock.freezeAt(NOW);

    await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();

    // Both models, because `dropDatabase` takes the indexes with it. The counter's unique
    // index is not incidental here: without it concurrent upserts each insert their own
    // document instead of contending, and the concurrency test below reads one of twenty
    // and reports a total that looks like nineteen lost writes.
    await moduleRef.get<Model<unknown>>(getModelToken(LimitOverrideSchemaClass.name)).init();
    await moduleRef.get<Model<unknown>>(getModelToken(UsageCounterSchemaClass.name)).init();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('refuses the movement that crosses the daily cap, with the remaining allowance', async () => {
    const query = account({ matrix: DAILY_1000 });

    await engine.record(query, Money.fromMinor('70000', 'GBP'));

    const breach = await engine
      .check(query, Money.fromMinor('50000', 'GBP'))
      .catch((error: unknown) => error);

    expect(breach).toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
      context: expect.objectContaining({
        rule: LimitRule.DAILY_AMOUNT,
        limit: { amount: '100000', currency: 'GBP' },
        remaining: { amount: '30000', currency: 'GBP' },
      }),
    });
  });

  it('resets the daily allowance at local midnight, not UTC midnight', async () => {
    const query = account({ matrix: DAILY_1000 });
    await engine.record(query, Money.fromMinor('70000', 'GBP'));

    // The reset instant surfaced to the customer is 23:00 UTC — midnight in London.
    const [before] = await engine.check(query, Money.fromMinor('1', 'GBP'));
    expect(before?.resetsAt.toISOString()).toBe('2026-08-03T23:00:00.000Z');
    expect(before?.used.amount).toBe(70_000n);

    // 23:00:01 UTC is 00:00:01 the next day in London, but still 16:00 in UTC terms.
    clock.freezeAt(new Date('2026-08-03T23:00:01.000Z'));

    const [after] = await engine.check(query, Money.fromMinor('99999', 'GBP'));
    expect(after?.used.amount).toBe(0n);
    expect(after?.remaining?.amount).toBe(100_000n);

    clock.freezeAt(NOW);
  });

  it('holds a tier 1 customer to the tier cap even when the product allows more', async () => {
    const generous: LimitMatrix = { ...DAILY_1000, daily: { amount: '5000000', currency: 'GBP' } };
    const query = account({ matrix: generous, kycTier: KycTier.TIER_1 });

    // Tier 1 allows £1,000 per movement and £2,500 a day. Two £1,000 movements fit;
    // the £600 that would take the day to £2,600 does not — and the refusal names the
    // tier's £2,500 cap, not the product's £50,000.
    await engine.record(query, Money.fromMinor('100000', 'GBP'));
    await engine.record(query, Money.fromMinor('100000', 'GBP'));

    const breach = await engine
      .check(query, Money.fromMinor('60000', 'GBP'))
      .catch((error: unknown) => error);

    expect(breach).toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
      context: expect.objectContaining({
        rule: LimitRule.DAILY_AMOUNT,
        limit: { amount: '250000', currency: 'GBP' },
        remaining: { amount: '50000', currency: 'GBP' },
      }),
    });

    // A single £3,000 movement is refused outright: it clears neither the tier's
    // per-transaction ceiling nor, by extension, anything else.
    const tooBig = await engine
      .check(query, Money.fromMinor('300000', 'GBP'))
      .catch((error: unknown) => error);
    expect(tooBig).toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
      context: expect.objectContaining({ rule: LimitRule.PER_TRANSACTION }),
    });

    // The same movement on a fully verified customer passes the same product matrix.
    const verified = account({ matrix: generous, kycTier: KycTier.TIER_3 });
    await expect(engine.check(verified, Money.fromMinor('300000', 'GBP'))).resolves.toHaveLength(2);
  });

  it('applies a granted override until it expires, then restores the cap', async () => {
    // Tier 0 allows £50 a movement, £100 a day and £500 a month; the grant raises all
    // three to £5,000 for one hour.
    const query = account({ matrix: DAILY_1000, kycTier: KycTier.TIER_0 });
    const grant = await overrides.grant(grantRequest(query.accountId, query.scope), ACTOR);

    expect(grant.id).toMatch(/^ovl_[0-9A-Z]{26}$/);
    await expect(engine.check(query, Money.fromMinor('200000', 'GBP'))).resolves.toBeDefined();

    clock.freezeAt(new Date(NOW.getTime() + 2 * HOUR_MS));
    const breach = await engine
      .check(query, Money.fromMinor('200000', 'GBP'))
      .catch((error: unknown) => error);

    expect(breach).toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
      context: expect.objectContaining({
        rule: LimitRule.PER_TRANSACTION,
        limit: { amount: '5000', currency: 'GBP' },
      }),
    });
    clock.freezeAt(NOW);
  });

  it('stops applying an override the moment it is revoked', async () => {
    const query = account({ matrix: DAILY_1000, kycTier: KycTier.TIER_0 });
    const grant = await overrides.grant(grantRequest(query.accountId, query.scope), ACTOR);

    await expect(engine.check(query, Money.fromMinor('200000', 'GBP'))).resolves.toBeDefined();

    const revoked = await overrides.revoke(grant.id);
    expect(revoked.revokedAt).not.toBeNull();

    const breach = await engine
      .check(query, Money.fromMinor('200000', 'GBP'))
      .catch((error: unknown) => error);
    expect(breach).toMatchObject({ code: ErrorCode.LIMIT_EXCEEDED });

    // A second revoke is a 404, not a silent success.
    await expect(overrides.revoke(grant.id)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('loses nothing when twenty movements land on the same counter at once', async () => {
    const query = account({ matrix: { ...DAILY_1000, daily: null, monthly: null } });
    const tenPounds = Money.fromMinor('1000', 'GBP');

    await Promise.all(Array.from({ length: 20 }, () => engine.record(query, tenPounds)));

    const windows = await engine.check(query, Money.fromMinor('1', 'GBP'));
    const day = windows[0];
    expect(day?.used.amount).toBe(20_000n);
    expect(day?.countUsed).toBe(20);
  });

  it('refuses an override with a past or unreasonably distant expiry', async () => {
    await expect(
      overrides.grant(
        grantRequest('acc_any', 'cardSpend', new Date(NOW.getTime() - HOUR_MS).toISOString()),
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });

    await expect(
      overrides.grant(
        grantRequest(
          'acc_any',
          'cardSpend',
          new Date(NOW.getTime() + 91 * 24 * HOUR_MS).toISOString(),
        ),
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('lists an account’s grant history, live and expired alike', async () => {
    const query = account({ matrix: DAILY_1000 });
    await overrides.grant(grantRequest(query.accountId, query.scope), ACTOR);
    await overrides.grant(grantRequest(query.accountId, query.scope), ACTOR);

    const history = await overrides.listForAccount(query.accountId);

    expect(history).toHaveLength(2);
    expect(history.every((entry) => entry.createdBy === ACTOR.id)).toBe(true);
  });
});

const ACTOR = { id: 'adm_integration' };

/** A fresh account identity per assertion, so counters never leak between tests. */
function account(partial: Partial<LimitCheckInput> & { matrix: LimitMatrix }): LimitCheckInput {
  return {
    accountId: `it_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    scope: 'internalTransfer',
    kycTier: KycTier.TIER_3,
    currency: 'GBP',
    ...partial,
  };
}

function grantRequest(accountId: string, scope: LimitCheckInput['scope'], expiresAt?: string) {
  return {
    accountId,
    scope,
    currency: 'GBP' as const,
    perTransaction: { amount: '500000', currency: 'GBP' as const },
    daily: { amount: '500000', currency: 'GBP' as const },
    // Monthly too. Each cap is resolved independently — deliberately, so a fraud team can
    // raise a daily without touching a monthly — so an override that omits this one leaves
    // the tier-0 monthly clamp of £500 in force and a £2,000 movement still breaches it.
    monthly: { amount: '500000', currency: 'GBP' as const },
    reason: 'Temporary raise while a complaint is investigated',
    expiresAt: expiresAt ?? new Date(NOW.getTime() + HOUR_MS).toISOString(),
  };
}
