/**
 * The insight screens.
 *
 * Two sources of truth, deliberately separated. Spend by category is *derived from the
 * transaction feed* so that every total reconciles with the list it links into; cash flow,
 * budgets and subscriptions come from the API, because they need history and closing balances the
 * feed does not carry.
 *
 * **Every component in this directory is a client component.** `@reliance/ui` ships no
 * `'use client'` markers of its own, so anything that touches it declares the boundary itself.
 */

export { BalanceArea, type BalanceAreaProps } from './balance-area';
export { BudgetList } from './budget-list';
export { CashflowBars, type CashflowBarsProps } from './cashflow-bars';
export { CashflowPanels, type CashflowPanelsProps } from './cashflow-panels';
export { CashflowTable, type CashflowTableProps } from './cashflow-table';
export { monthLabel, toCashflowSeries, type CashflowPoint } from './cashflow-series';
export { CategoryTable, type CategoryTableProps } from './category-table';
export { ChartFrame, type ChartFrameProps } from './chart-frame';
export { CATEGORICAL_SERIES, MONEY_SERIES, seriesColour } from './chart-palette';
export { MerchantLeaderboard, type MerchantLeaderboardProps } from './merchant-leaderboard';
export {
  DEFAULT_PERIOD,
  PERIOD_LABEL,
  PERIOD_ORDER,
  PERIOD_PARAM,
  Period,
  periodFilters,
  periodRange,
  readPeriod,
  type PeriodRange,
} from './period';
export { PeriodSwitcher, type PeriodSwitcherProps } from './period-switcher';
export { insightsRoute } from './routes';
export { SpendDonut, type SpendDonutProps } from './spend-donut';
export { SpendPanel, type SpendPanelProps } from './spend-panel';
export { SubscriptionTracker, type SubscriptionTrackerProps } from './subscription-tracker';
export { CADENCE_LABEL, monthlyEquivalent } from './subscriptions';
export { useBudgets, useCashflow, useSubscriptions, insightsKeys } from './use-insights';
export { useSpendPeriod, type SpendPeriod } from './use-spend';
export { useChartAnimation, useReducedMotion } from './use-reduced-motion';
