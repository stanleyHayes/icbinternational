/**
 * FX handlers: the board, quotes, conversions and rate alerts.
 */

import { ErrorCode, routes } from '@reliance/contracts';

import { findAccount } from '../db/ledger.js';
import { applyBps, money, zero } from '../db/money.js';
import { mockId, opaqueId } from '../faker.js';

import {
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate, paginateStatic } from './paging.js';
import { readMoney } from './read-body.js';

const QUOTE_MINUTES = 10;

/** FX. */
export const fxHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.fx.rates, ({ db, query }) => {
    const to = query.get('to');
    return paginateStatic(db.fxRates.filter((rate) => !to || rate.to === to));
  }),

  route(MockMethod.GET, routes.fx.board, ({ db }) =>
    resourceOk({ base: 'GBP', rates: db.fxRates, asOf: db.clock.nowIso() }),
  ),

  route(MockMethod.POST, routes.fx.quote, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const from = findAccount(db, String(input.fromAccountId ?? ''));
    const to = findAccount(db, String(input.toAccountId ?? ''));
    if (!from || !to) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

    const rate = db.fxRates.find((candidate) => candidate.to === to.currency);
    if (!rate) return failure(ErrorCode.RATE_UNAVAILABLE, 'We cannot price that pair right now.');

    const sell = readMoney(body, 'sellAmount') ?? money(10_000, from.currency);
    const buyMinor = BigInt(Math.round(Number(sell.amount) * Number(rate.ask)));
    const spreadCost = applyBps(sell, rate.spreadBps);

    return resourceOk({
      id: mockId('qte'),
      from: from.currency,
      to: to.currency,
      sellAmount: sell,
      buyAmount: money(buyMinor, to.currency),
      rate: rate.ask,
      midRate: rate.mid,
      spreadBps: rate.spreadBps,
      spreadCost,
      fee: zero(from.currency),
      expiresAt: db.clock.minutesAhead(QUOTE_MINUTES),
      createdAt: db.clock.nowIso(),
    });
  }),

  route(MockMethod.POST, routes.fx.convert, ({ db }) => {
    const transfer = db.transfers[0];
    return transfer
      ? resourceCreated(transfer)
      : failure(ErrorCode.QUOTE_EXPIRED, 'That quote has expired. Please price it again.');
  }),

  route(MockMethod.GET, routes.fx.alerts, ({ db, query }) => paginate(db.fxAlerts, query)),

  route(MockMethod.POST, routes.fx.alerts, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const alert = {
      id: opaqueId(),
      from: String(input.from ?? 'GBP') as (typeof db.fxRates)[number]['from'],
      to: String(input.to ?? 'EUR') as (typeof db.fxRates)[number]['to'],
      direction: (input.direction === 'BELOW' ? 'BELOW' : 'ABOVE') as 'ABOVE' | 'BELOW',
      targetRate: String(input.targetRate ?? '1.2000'),
      active: true,
      triggeredAt: null,
      createdAt: db.clock.nowIso(),
    };
    db.fxAlerts.unshift(alert);
    return resourceCreated(alert);
  }),

  route(MockMethod.GET, routes.fx.alert(':id'), ({ db, params }) => {
    const alert = db.fxAlerts.find((candidate) => candidate.id === params.id);
    return alert ? resourceOk(alert) : notFound('That alert');
  }),

  route(MockMethod.DELETE, routes.fx.alert(':id'), ({ db, params }) => {
    const index = db.fxAlerts.findIndex((candidate) => candidate.id === params.id);
    const alert = db.fxAlerts[index];
    if (index === -1 || !alert) return notFound('That alert');
    db.fxAlerts.splice(index, 1);
    return resourceOk(alert);
  }),
];
