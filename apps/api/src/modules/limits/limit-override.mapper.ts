import { type CurrencyCode } from '@reliance/money';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { type LimitScope } from '../products/index.js';

import { type LimitOverride } from './limit-override.js';
import { type LimitOverrideDocument } from './limit-override.schema.js';

/** The wire shape of an override, as the admin console renders it. */
export interface LimitOverrideView {
  readonly id: string;
  readonly accountId: string;
  readonly scope: string;
  readonly channel: string;
  readonly currency: string;
  readonly perTransaction: StoredMoney | null;
  readonly daily: StoredMoney | null;
  readonly monthly: StoredMoney | null;
  readonly dailyCount: number | null;
  readonly reason: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** Document → domain. The engine never sees a Mongoose type. */
export function toDomainOverride(document: LimitOverrideDocument): LimitOverride {
  return {
    id: document.id,
    accountId: document.accountId,
    scope: document.scope as LimitScope,
    channel: document.channel,
    currency: document.currency as CurrencyCode,
    perTransaction: document.perTransaction?.amount ?? null,
    daily: document.daily?.amount ?? null,
    monthly: document.monthly?.amount ?? null,
    dailyCount: document.dailyCount,
    reason: document.reason,
    expiresAt: document.expiresAt,
    revokedAt: document.revokedAt,
    createdBy: document.createdBy,
    createdAt: document.createdAt,
  };
}

/** Document → wire. ISO strings on the boundary, `Date` inside. */
export function toOverrideView(document: LimitOverrideDocument): LimitOverrideView {
  return {
    id: document.id,
    accountId: document.accountId,
    scope: document.scope,
    channel: document.channel,
    currency: document.currency,
    perTransaction: document.perTransaction,
    daily: document.daily,
    monthly: document.monthly,
    dailyCount: document.dailyCount,
    reason: document.reason,
    expiresAt: document.expiresAt.toISOString(),
    revokedAt: document.revokedAt?.toISOString() ?? null,
    createdBy: document.createdBy,
    createdAt: document.createdAt.toISOString(),
  };
}
