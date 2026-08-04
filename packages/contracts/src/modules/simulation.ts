/**
 * The simulation control room.
 *
 * This is what makes Reliance Bank demonstrable rather than merely built: time can be
 * advanced, rails can be made to fail, markets can be moved, and a year of banking can be
 * played out in a minute. Every endpoint here is gated behind `simulation:run`, and the
 * whole module refuses to load when `SIM_CLOCK_ENABLED` is false.
 */

import { z } from 'zod';

import {
  currencyCodeSchema,
  entityId,
  isoDateTimeSchema,
  mediumTextSchema,
  positiveMoneySchema,
  rateSchema,
  shortTextSchema,
} from '../common/primitives.js';

export const simClockSchema = z.object({
  /** True wall-clock time on the server. */
  realNow: isoDateTimeSchema,
  /** What the application believes the time is — every service reads this. */
  simulatedNow: isoDateTimeSchema,
  offsetSeconds: z.number().int(),
  frozen: z.boolean(),
});
export type SimClock = z.infer<typeof simClockSchema>;

export const advanceClockRequestSchema = z
  .object({
    days: z.number().int().min(0).max(3650).default(0),
    hours: z.number().int().min(0).max(23).default(0),
    minutes: z.number().int().min(0).max(59).default(0),
    /** Run every scheduled job the jump passes over, in order. Usually what you want. */
    runScheduledJobs: z.boolean().default(true),
  })
  .refine((input) => input.days + input.hours + input.minutes > 0, {
    message: 'advance by at least one unit of time',
  });
export type AdvanceClockRequest = z.infer<typeof advanceClockRequestSchema>;

export const SimJob = {
  ACCRUE_INTEREST: 'ACCRUE_INTEREST',
  CAPITALISE_INTEREST: 'CAPITALISE_INTEREST',
  RUN_STANDING_ORDERS: 'RUN_STANDING_ORDERS',
  SETTLE_CARD_BATCH: 'SETTLE_CARD_BATCH',
  SETTLE_TRANSFER_BATCH: 'SETTLE_TRANSFER_BATCH',
  GENERATE_STATEMENTS: 'GENERATE_STATEMENTS',
  CHARGE_MONTHLY_FEES: 'CHARGE_MONTHLY_FEES',
  MATURE_DEPOSITS: 'MATURE_DEPOSITS',
  ASSESS_ARREARS: 'ASSESS_ARREARS',
  EXPIRE_HOLDS: 'EXPIRE_HOLDS',
  RESCREEN_CUSTOMERS: 'RESCREEN_CUSTOMERS',
} as const;
export type SimJob = (typeof SimJob)[keyof typeof SimJob];

export const runJobRequestSchema = z.object({
  job: z.enum(SimJob),
  dryRun: z.boolean().default(false),
});
export type RunJobRequest = z.infer<typeof runJobRequestSchema>;

export const jobResultSchema = z.object({
  data: z.object({
    job: z.enum(SimJob),
    dryRun: z.boolean(),
    processed: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    durationMs: z.number().int(),
    log: z.array(shortTextSchema),
  }),
});
export type JobResult = z.infer<typeof jobResultSchema>;

/** How each simulated rail behaves. Deterministic given the same `seed`. */
export const railBehaviourSchema = z.object({
  rail: z.enum(['ACH', 'RTGS', 'SWIFT', 'CARD_NETWORK', 'BILLER', 'SMS', 'KYC_VENDOR']),
  /** Probability of failure, in basis points. 500 = 5%. */
  failureRateBps: z.number().int().min(0).max(10_000),
  latencyMinMs: z.number().int().min(0).max(60_000),
  latencyMaxMs: z.number().int().min(0).max(60_000),
  /** Force every call to fail — used to prove the reversal paths work. */
  forceOutage: z.boolean(),
});
export type RailBehaviour = z.infer<typeof railBehaviourSchema>;

export const simStateSchema = z.object({
  clock: simClockSchema,
  seed: z.string(),
  rails: z.array(railBehaviourSchema),
  activeScenario: shortTextSchema.nullable(),
  snapshotCount: z.number().int(),
});
export type SimState = z.infer<typeof simStateSchema>;

export const SimScenario = {
  PAYDAY: 'PAYDAY',
  FRAUD_WAVE: 'FRAUD_WAVE',
  MARKET_CRASH: 'MARKET_CRASH',
  RAIL_OUTAGE: 'RAIL_OUTAGE',
  MONTH_END_CLOSE: 'MONTH_END_CLOSE',
  ARREARS_SPIKE: 'ARREARS_SPIKE',
  HIGH_VOLUME_DAY: 'HIGH_VOLUME_DAY',
} as const;
export type SimScenario = (typeof SimScenario)[keyof typeof SimScenario];

export const runScenarioRequestSchema = z.object({
  scenario: z.enum(SimScenario),
  intensity: z.enum(['LIGHT', 'NORMAL', 'HEAVY']).default('NORMAL'),
});
export type RunScenarioRequest = z.infer<typeof runScenarioRequestSchema>;

export const generateTrafficRequestSchema = z.object({
  customers: z.number().int().min(0).max(500).default(0),
  transactionsPerCustomer: z.number().int().min(0).max(500).default(50),
  overDays: z.number().int().min(1).max(730).default(90),
});
export type GenerateTrafficRequest = z.infer<typeof generateTrafficRequestSchema>;

/**
 * Credits the external clearing account so simulated inbound money has a real source.
 * Even fake money must come from somewhere — otherwise the trial balance stops summing
 * to zero, and the whole double-entry guarantee is quietly worthless.
 */
export const mintFundsRequestSchema = z.object({
  toAccountId: entityId('acc'),
  amount: positiveMoneySchema,
  narrative: shortTextSchema.default('Credit transfer received'),
});
export type MintFundsRequest = z.infer<typeof mintFundsRequestSchema>;

export const moveRateRequestSchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  newMid: rateSchema,
});
export type MoveRateRequest = z.infer<typeof moveRateRequestSchema>;

export const snapshotSchema = z.object({
  id: z.string(),
  label: shortTextSchema,
  description: mediumTextSchema.nullable(),
  documentCounts: z.record(z.string(), z.number().int()),
  simulatedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
