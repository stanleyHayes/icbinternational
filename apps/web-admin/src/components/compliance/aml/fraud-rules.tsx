/**
 * The fraud rule book.
 *
 * Every row carries what it caught and what it cost, side by side, because a fraud rule
 * is always a trade. A rule that blocks nine frauds a month and also stops six hundred
 * genuine payments is not a good rule, and the only way anybody notices is if the
 * false-positive rate is on screen next to the trigger count rather than in a monthly
 * report.
 *
 * Marking a rule as producing false positives is done by changing what it does — moving
 * it from `BLOCK` to `REVIEW` or `SCORE_ONLY` — rather than by a flag that records an
 * opinion and changes nothing. An analyst's judgement that a rule is too aggressive should
 * make the rule less aggressive.
 */

'use client';

import type { FraudRule } from '@reliance/api-client';
import { Alert, Badge, Button, Select, Switch } from '@reliance/ui';

import {
  failureMessage,
  QueueError,
  QueueLoading,
  severityTone,
} from '@/components/compliance/kit';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { formatBasisPoints, formatCount, formatInstant, humaniseCode } from '@/lib/format';

import { useFraudRules, useUpdateFraudRule } from '../data/use-fraud';

/** What a rule does when it fires, from lightest to heaviest. */
const ACTIONS = [
  { value: 'SCORE_ONLY', label: 'Score only — record it and let it through' },
  { value: 'REVIEW', label: 'Review — queue it for a person' },
  { value: 'CHALLENGE', label: 'Challenge — ask the customer to confirm' },
  { value: 'BLOCK', label: 'Block — refuse the payment' },
];

const ACTION_TONE = {
  SCORE_ONLY: 'neutral',
  REVIEW: 'info',
  CHALLENGE: 'warning',
  BLOCK: 'danger',
} as const;

interface RuleControls {
  readonly rules: readonly FraudRule[];
  readonly isSaving: boolean;
  readonly onChange: (ruleId: string, changes: Partial<FraudRule>) => void;
}

const STATIC_COLUMNS: readonly DataColumn<FraudRule>[] = [
  {
    id: 'severity',
    header: 'Severity',
    cell: (rule) => <Badge tone={severityTone(rule.severity)}>{humaniseCode(rule.severity)}</Badge>,
    csv: (rule) => humaniseCode(rule.severity),
  },
  {
    id: 'triggers',
    header: 'Fired (30 days)',
    align: 'end',
    cell: (rule) => (
      <span className="text-fg font-mono text-sm tabular-nums">
        {formatCount(rule.triggersLast30Days)}
      </span>
    ),
    csv: (rule) => String(rule.triggersLast30Days),
    sortValue: (rule) => rule.triggersLast30Days,
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
  {
    id: 'updated',
    header: 'Last changed',
    cell: (rule) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(rule.updatedAt)}</span>
    ),
    csv: (rule) => formatInstant(rule.updatedAt),
  },
];

const NAME_COLUMN: DataColumn<FraudRule> = {
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
};

function EnabledCell({ rule, controls }: Readonly<{ rule: FraudRule; controls: RuleControls }>) {
  return (
    <Switch
      checked={rule.enabled}
      disabled={controls.isSaving}
      aria-label={`${rule.name} is ${rule.enabled ? 'live' : 'switched off'}`}
      onChange={(event) => controls.onChange(rule.id, { enabled: event.target.checked })}
    />
  );
}

function ActionCell({ rule, controls }: Readonly<{ rule: FraudRule; controls: RuleControls }>) {
  return (
    <Select
      selectSize="sm"
      value={rule.action}
      options={ACTIONS}
      disabled={controls.isSaving}
      aria-label={`Action for ${rule.name}`}
      onChange={(event) =>
        controls.onChange(rule.id, { action: event.target.value as FraudRule['action'] })
      }
    />
  );
}

function editableColumns(controls: RuleControls): readonly DataColumn<FraudRule>[] {
  return [
    {
      id: 'enabled',
      header: 'Live',
      cell: (rule) => <EnabledCell rule={rule} controls={controls} />,
      csv: (rule) => (rule.enabled ? 'Live' : 'Off'),
      sortValue: (rule) => String(rule.enabled),
    },
    {
      id: 'action',
      header: 'What it does',
      cell: (rule) => <ActionCell rule={rule} controls={controls} />,
      csv: (rule) => humaniseCode(rule.action),
    },
    {
      id: 'softened',
      header: 'Too aggressive?',
      alwaysVisible: true,
      align: 'end',
      cell: (rule) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={controls.isSaving || rule.action === 'SCORE_ONLY'}
          onClick={() => controls.onChange(rule.id, { action: 'REVIEW' })}
        >
          Send to review instead
        </Button>
      ),
      csv: () => '',
    },
  ];
}

/** Every column of the fraud rule book, editable ones first. */
function columns(controls: RuleControls): readonly DataColumn<FraudRule>[] {
  const editable = editableColumns(controls);
  return [NAME_COLUMN, ...editable.slice(0, -1), ...STATIC_COLUMNS, ...editable.slice(-1)];
}

const TONE_NOTE =
  'Blocking rules refuse a customer’s payment outright. Every one of them should be able to ' +
  'justify its false-positive rate.';

/** The fraud rule book, editable in place. */
export function FraudRules() {
  const rules = useFraudRules();
  const update = useUpdateFraudRule();
  const current = rules.data?.data ?? [];

  if (rules.isPending) return <QueueLoading label="fraud rules" />;
  if (rules.isError) {
    return <QueueError error={rules.error} subject="the fraud rules" onRetry={rules.refetch} />;
  }

  const blocking = current.filter((rule) => rule.enabled && rule.action === 'BLOCK').length;

  return (
    <div className="flex flex-col gap-3">
      <Alert tone={blocking > 0 ? 'warning' : 'info'} title={`${blocking} rules block payments`}>
        {TONE_NOTE}
      </Alert>

      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}

      <DataTable
        tableId="fraud-rules"
        caption="Fraud rules and how each is performing"
        rowNoun="rules"
        columns={columns({
          rules: current,
          isSaving: update.isPending,
          onChange: (ruleId, changes) => update.mutate({ current, ruleId, changes }),
        })}
        rows={current}
        rowKey={(rule) => rule.id}
        exportName="fraud-rules"
        defaultSort={{ columnId: 'triggers', direction: 'desc' }}
      />
    </div>
  );
}

/** Colour for a fraud action, exported so a summary elsewhere can match this table. */
export const fraudActionTone = (action: FraudRule['action']) => ACTION_TONE[action];
