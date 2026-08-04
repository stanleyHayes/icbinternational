/**
 * Cache keys for the compliance and risk workstations.
 *
 * Grouped by queue rather than by endpoint, because that is the unit an operator changes:
 * adjudicating a screening hit refreshes the screening queue and the customer it belongs
 * to, and leaves the monitoring alerts alone.
 */

import { CONSOLE_KEY } from '@/components/compliance/kit';

const RISK = 'risk' as const;

/** Query keys for identity review, screening, monitoring, investigations and rules. */
export const riskKeys = {
  /** The whole risk lane. */
  all: [CONSOLE_KEY, RISK] as const,

  kyc: [CONSOLE_KEY, RISK, 'kyc'] as const,
  kycQueue: (filters: Readonly<Record<string, string>>) =>
    [CONSOLE_KEY, RISK, 'kyc', 'queue', filters] as const,
  kycCase: (caseId: string) => [CONSOLE_KEY, RISK, 'kyc', 'case', caseId] as const,

  screening: [CONSOLE_KEY, RISK, 'screening'] as const,
  screeningQueue: (filters: Readonly<Record<string, string>>) =>
    [CONSOLE_KEY, RISK, 'screening', 'queue', filters] as const,

  alerts: [CONSOLE_KEY, RISK, 'alerts'] as const,
  alertQueue: (filters: Readonly<Record<string, string>>) =>
    [CONSOLE_KEY, RISK, 'alerts', 'queue', filters] as const,

  cases: [CONSOLE_KEY, RISK, 'cases'] as const,
  caseList: [CONSOLE_KEY, RISK, 'cases', 'list'] as const,
  caseDetail: (caseId: string) => [CONSOLE_KEY, RISK, 'cases', 'detail', caseId] as const,

  rules: [CONSOLE_KEY, RISK, 'rules'] as const,
  monitoringRules: [CONSOLE_KEY, RISK, 'rules', 'monitoring'] as const,
  fraudRules: [CONSOLE_KEY, RISK, 'rules', 'fraud'] as const,
  backtest: (ruleId: string, windowDays: number) =>
    [CONSOLE_KEY, RISK, 'rules', 'backtest', ruleId, windowDays] as const,
};
