/**
 * Open monitoring alerts, by how urgent they are.
 *
 * Grouped by severity rather than listed, because the useful question at this level is
 * whether anything critical is unattended — the triage itself happens on the monitoring
 * queue, with the customer and the transactions in front of the analyst.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { AlertSeverity, AlertStatus, Permission, type AmlAlert } from '@reliance/contracts';
import { Badge, EmptyState } from '@reliance/ui';

import { ActionLink, Panel, QueryState, opsKeys, toneForSeverity } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, humaniseCode } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';

/** Alerts sampled for the summary. Deep enough to make the severity split meaningful. */
const SAMPLE_SIZE = 100;

/** How long the summary is trusted before it is re-read. */
const SUMMARY_STALE_MS = 60_000;

/** Severities in the order an analyst works them. */
const ORDER: readonly AlertSeverity[] = [
  AlertSeverity.CRITICAL,
  AlertSeverity.HIGH,
  AlertSeverity.MEDIUM,
  AlertSeverity.LOW,
];

function countBySeverity(alerts: readonly AmlAlert[]): Readonly<Record<AlertSeverity, number>> {
  const counts: Record<AlertSeverity, number> = {
    [AlertSeverity.LOW]: 0,
    [AlertSeverity.MEDIUM]: 0,
    [AlertSeverity.HIGH]: 0,
    [AlertSeverity.CRITICAL]: 0,
  };
  for (const alert of alerts) counts[alert.severity] += 1;
  return counts;
}

/** Open transaction-monitoring alerts, split by severity. */
/** Open alerts by severity, worst first. */
function SeverityBreakdown({ counts }: { readonly counts: ReturnType<typeof countBySeverity> }) {
  return (
    <ul className="flex flex-col gap-2">
      {ORDER.map((severity) => (
        <li key={severity} className="flex items-center justify-between gap-3">
          <span className="font-body text-fg text-sm">{humaniseCode(severity)}</span>
          <Badge tone={toneForSeverity(severity)} size="md">
            {formatCount(counts[severity])}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function AlertSummary() {
  const client = useApiClient();
  const allowed = usePermissions().has(Permission.AML_READ);

  const query = useQuery({
    queryKey: opsKeys.queueDepth('monitoring-severity'),
    queryFn: async ({ signal }) =>
      (await client.admin.amlAlerts({ status: AlertStatus.OPEN, limit: SAMPLE_SIZE }, { signal }))
        .data,
    enabled: allowed,
    staleTime: SUMMARY_STALE_MS,
  });

  if (!allowed) return null;
  const counts = countBySeverity(query.data ?? []);
  const total = (query.data ?? []).length;

  return (
    <Panel
      title="Open monitoring alerts"
      description="Untriaged transaction-monitoring alerts, by severity."
      action={<ActionLink to="/aml/alerts">Work the queue</ActionLink>}
    >
      <QueryState query={query} subject="the monitoring alert summary">
        {total === 0 ? (
          <EmptyState
            title="Nothing is waiting"
            description="Every monitoring alert raised so far has been triaged."
          />
        ) : (
          <SeverityBreakdown counts={counts} />
        )}
      </QueryState>
    </Panel>
  );
}
