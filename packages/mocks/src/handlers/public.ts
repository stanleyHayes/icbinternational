/**
 * Public marketing handlers and the system endpoints.
 *
 * Nothing here reads `db.currentUser`. The contract makes the separation between the
 * marketing surface and the banking API a boundary rather than a convention, and the
 * mocks honour it so a marketing lane cannot accidentally build against customer data.
 */

import { routes } from '@reliance/contracts';

import { applyBps, addMoney, minorUnits, money, zero } from '../db/money.js';
import { makeSchedule } from '../factories/products.js';

import {
  acknowledged,
  MockMethod,
  notFound,
  raw,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate, paginateStatic } from './paging.js';
import { readMoney } from './read-body.js';

const MONTHS_PER_YEAR = 12;
const MILESTONE_COUNT = 5;

/** The unauthenticated marketing surface. */
export const publicHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.public.rates, ({ db }) =>
    resourceOk({
      savings: db.products
        .filter((product) => product.creditInterestTiers.length > 0)
        .map((product) => ({
          productCode: product.code,
          productName: product.name,
          annualRateBps: product.creditInterestTiers[0]?.annualRateBps ?? 0,
          minBalance: product.minBalance,
        })),
      lending: db.loanProducts.map((product) => ({
        productCode: product.code,
        productName: product.name,
        representativeAprBps: product.representativeAprBps,
        maxAmount: product.maxAmount,
      })),
      effectiveFrom: db.clock.dateDaysAgo(30),
      asOf: db.clock.nowIso(),
    }),
  ),

  route(MockMethod.GET, routes.public.fxBoard, ({ db }) =>
    resourceOk({ base: 'GBP', rates: db.fxRates, asOf: db.clock.nowIso() }),
  ),

  route(MockMethod.GET, routes.public.fees, ({ db }) => paginateStatic(db.fees)),

  route(MockMethod.GET, routes.public.products, ({ db, query }) =>
    paginate(
      db.products
        .filter((product) => product.active)
        .map((product) => ({
          ...product,
          id: product.code,
        })),
      query,
      { includeTotal: true },
    ),
  ),

  route(MockMethod.GET, routes.public.locations, ({ db, query }) => {
    const kind = query.get('kind');
    const search = query.get('query')?.toLowerCase();
    return paginate(
      db.locations.filter(
        (location) =>
          (!kind || location.kind === kind) &&
          (!search ||
            location.name.toLowerCase().includes(search) ||
            location.city.toLowerCase().includes(search)),
      ),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.public.page(':slug'), ({ db, params }) => {
    const page = db.pages.find((candidate) => candidate.slug === params.slug);
    return page ? resourceOk(page) : notFound('That page');
  }),

  route(MockMethod.GET, routes.public.posts, ({ db, query }) => {
    const category = query.get('category');
    return paginate(
      db.articles.filter((article) => !category || article.category === category),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.public.post(':slug'), ({ db, params }) => {
    const article = db.articles.find((candidate) => candidate.slug === params.slug);
    return article ? resourceOk(article) : notFound('That article');
  }),

  route(MockMethod.GET, routes.public.faqs, ({ db, query }) => paginate(db.faqs, query)),

  route(MockMethod.POST, routes.public.leads, () => acknowledged()),
  route(MockMethod.POST, routes.public.newsletter, () => acknowledged()),

  route(MockMethod.POST, routes.public.loanCalculator, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const product =
      db.loanProducts.find((candidate) => candidate.code === input.productCode) ??
      db.loanProducts[0];
    if (!product) return notFound('A loan product');

    const amount = readMoney(body, 'amount') ?? money(500_000);
    const termMonths = Number(input.termMonths ?? 36);
    const schedule = makeSchedule({
      clock: db.clock,
      principalMinor: minorUnits(amount),
      aprBps: product.representativeAprBps,
      termMonths,
    });
    const totalInterest = schedule.reduce((sum, row) => sum + minorUnits(row.interest), 0n);

    return resourceOk({
      productCode: product.code,
      amount,
      termMonths,
      aprBps: product.representativeAprBps,
      monthlyPayment: schedule[0]?.payment ?? zero(),
      totalRepayable: money(minorUnits(amount) + totalInterest, amount.currency),
      totalInterest: money(totalInterest, amount.currency),
      arrangementFee: product.arrangementFee,
      firstPaymentDate: db.clock.dateDaysAhead(30),
      schedule,
    });
  }),

  /**
   * The savings projection compounds monthly in integer minor units.
   *
   * Compounding with floats and rounding at the end would show a total a penny or two
   * away from what the same inputs produce on the real endpoint, and the first person to
   * notice would be a customer comparing the calculator with their statement.
   */
  route(MockMethod.POST, routes.public.savingsCalculator, ({ body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const initial = readMoney(body, 'initialDeposit') ?? zero();
    const monthly = readMoney(body, 'monthlyContribution') ?? zero();
    const annualRateBps = Number(input.annualRateBps ?? 425);
    const months = Number(input.months ?? 60);
    const monthlyRateBps = Math.round(annualRateBps / MONTHS_PER_YEAR);

    let balance = minorUnits(initial);
    let interestTotal = 0n;
    const milestones: { month: number; balance: typeof initial; interest: typeof initial }[] = [];
    const step = Math.max(Math.floor(months / MILESTONE_COUNT), 1);

    for (let month = 1; month <= months; month += 1) {
      const interest = minorUnits(applyBps(money(balance, initial.currency), monthlyRateBps));
      balance += interest + minorUnits(monthly);
      interestTotal += interest;

      if (month % step === 0 || month === months) {
        milestones.push({
          month,
          balance: money(balance, initial.currency),
          interest: money(interestTotal, initial.currency),
        });
      }
    }

    return resourceOk({
      initialDeposit: initial,
      monthlyContribution: monthly,
      annualRateBps,
      months,
      totalContributions: addMoney(
        initial,
        money(minorUnits(monthly) * BigInt(months), initial.currency),
      ),
      totalInterest: money(interestTotal, initial.currency),
      finalBalance: money(balance, initial.currency),
      milestones,
    });
  }),
];

/** Health, readiness, metrics and docs. */
export const systemHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.system.ready, () => raw(health())),
  route(MockMethod.GET, routes.system.health, () => raw(health())),

  route(MockMethod.GET, routes.system.metrics, ({ db }) =>
    raw(
      [
        '# HELP reliance_accounts_total Number of customer accounts.',
        '# TYPE reliance_accounts_total gauge',
        `reliance_accounts_total ${db.accounts.length}`,
        '# HELP reliance_transactions_total Number of booked transactions.',
        '# TYPE reliance_transactions_total counter',
        `reliance_transactions_total ${db.transactions.length}`,
        '',
      ].join('\n'),
    ),
  ),

  route(MockMethod.GET, routes.system.docs, () =>
    raw({ openapi: '3.1.0', info: { title: 'Reliance Bank API', version: '1.0.0' }, paths: {} }),
  ),
];

function health() {
  const up = { status: 'up' };
  return {
    status: 'ok' as const,
    info: { mongodb: up },
    details: { mongodb: up },
  };
}
