/**
 * Rule tuning, for both rule books.
 *
 * Monitoring and fraud rules live on one screen under two tabs because the people who
 * tune them are the same people and the trade-off is the same trade-off: catch more, or
 * bother fewer customers. Separating them into two screens lets a team optimise one
 * without seeing what it did to the other's queue.
 *
 * A monitoring rule cannot be switched on from here without the replay panel being right
 * next to it. That is the whole reason the two sit side by side.
 */

'use client';

import { useState } from 'react';

import { Permission, type AmlRule } from '@reliance/contracts';
import { Badge, StatusPill, Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import {
  ConsoleScreen,
  MetricRow,
  MetricTile,
  openColumn,
  QueueError,
  QueueLoading,
  ScreenPanel,
  severityTone,
} from '@/components/compliance/kit';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { formatBasisPoints, formatCount, humaniseCode } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';

import { useAmlRules } from '../data/use-aml';

import { FraudRules } from './fraud-rules';
import { RuleBacktest } from './rule-backtest';
import { RuleEditor } from './rule-editor';

const DESCRIPTION =
  'The rules that raise monitoring alerts and the rules that stop fraudulent payments. ' +
  'Replay a change over history before you switch it on: a threshold moved blind either ' +
  'floods the queue or stops catching anything, and neither shows up for weeks.';

const CANNOT_EDIT = 'Your role lets you read the rule book but not change it.';

const RULE_COLUMNS: readonly DataColumn<AmlRule>[] = [
  {
    id: 'rule',
    header: 'Rule',
    alwaysVisible: true,
    cell: (rule) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">{rule.name}</span>
        <span className="font-body text-fg-muted text-xs">{rule.description}</span>
      </span>
    ),
    csv: (rule) => rule.name,
  },
  {
    id: 'kind',
    header: 'Pattern',
    cell: (rule) => <Badge>{humaniseCode(rule.kind)}</Badge>,
    csv: (rule) => humaniseCode(rule.kind),
  },
  {
    id: 'enabled',
    header: 'State',
    cell: (rule) => (
      <StatusPill
        tone={rule.enabled ? 'success' : 'neutral'}
        label={rule.enabled ? 'Live' : 'Switched off'}
      />
    ),
    csv: (rule) => (rule.enabled ? 'Live' : 'Switched off'),
  },
  {
    id: 'severity',
    header: 'Severity',
    cell: (rule) => <Badge tone={severityTone(rule.severity)}>{humaniseCode(rule.severity)}</Badge>,
    csv: (rule) => humaniseCode(rule.severity),
  },
  {
    id: 'alerts',
    header: 'Alerts (30 days)',
    align: 'end',
    cell: (rule) => (
      <span className="text-fg font-mono text-sm tabular-nums">
        {formatCount(rule.alertsLast30Days)}
      </span>
    ),
    csv: (rule) => String(rule.alertsLast30Days),
    sortValue: (rule) => rule.alertsLast30Days,
  },
  {
    id: 'falsePositives',
    header: 'False positives',
    align: 'end',
    cell: (rule) => (
      <span className="text-fg font-mono text-sm tabular-nums">
        {formatBasisPoints(rule.falsePositiveRateBps)}
      </span>
    ),
    csv: (rule) => formatBasisPoints(rule.falsePositiveRateBps),
    sortValue: (rule) => rule.falsePositiveRateBps,
  },
];

function monitoringColumns(
  openId: string | null,
  onOpen: (ruleId: string) => void,
): readonly DataColumn<AmlRule>[] {
  return [
    ...RULE_COLUMNS,
    openColumn<AmlRule>({ header: 'Tune', idOf: (rule) => rule.id, openId, onOpen }),
  ];
}

function RuleTiles({ rules }: Readonly<{ rules: readonly AmlRule[] }>) {
  const live = rules.filter((rule) => rule.enabled).length;
  const raised = rules.reduce((total, rule) => total + rule.alertsLast30Days, 0);

  return (
    <MetricRow>
      <MetricTile label="Rules in the book" value={formatCount(rules.length)} />
      <MetricTile label="Live" value={formatCount(live)} />
      <MetricTile label="Alerts raised (30 days)" value={formatCount(raised)} />
      <MetricTile label="Switched off" value={formatCount(rules.length - live)} />
    </MetricRow>
  );
}

function MonitoringTab({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rules = useAmlRules();
  const rows = rules.data?.data ?? [];
  const selected = rows.find((rule) => rule.id === openId) ?? null;

  if (rules.isPending) return <QueueLoading label="monitoring rules" />;
  if (rules.isError) {
    return (
      <QueueError error={rules.error} subject="the monitoring rules" onRetry={rules.refetch} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RuleTiles rules={rows} />

      <ScreenPanel title="Monitoring rules" flush>
        <DataTable
          tableId="aml-rules"
          caption="Transaction-monitoring rules"
          rowNoun="rules"
          columns={monitoringColumns(openId, setOpenId)}
          rows={rows}
          rowKey={(rule) => rule.id}
          exportName="monitoring-rules"
          defaultSort={{ columnId: 'alerts', direction: 'desc' }}
        />
      </ScreenPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <ScreenPanel title="Thresholds">
          <RuleEditor rule={selected} blockedReason={canEdit ? null : CANNOT_EDIT} />
        </ScreenPanel>
        <ScreenPanel title="Replay over history">
          <RuleBacktest ruleId={selected?.id ?? null} />
        </ScreenPanel>
      </div>
    </div>
  );
}

/** The rule-tuning screen. */
export function RulesConsole() {
  const permissions = usePermissions();

  return (
    <ConsoleScreen title="Rule tuning" description={DESCRIPTION}>
      <Tabs defaultValue="monitoring">
        <TabList label="Rule books">
          <Tab value="monitoring">Monitoring rules</Tab>
          <Tab value="fraud">Fraud rules</Tab>
        </TabList>
        <TabPanel value="monitoring">
          <MonitoringTab canEdit={permissions.has(Permission.AML_RULE_WRITE)} />
        </TabPanel>
        <TabPanel value="fraud">
          <FraudRules />
        </TabPanel>
      </Tabs>
    </ConsoleScreen>
  );
}
