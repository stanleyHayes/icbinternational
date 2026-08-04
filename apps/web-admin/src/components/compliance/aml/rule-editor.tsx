/**
 * Retuning a monitoring rule.
 *
 * Parameters are rendered from whatever the rule actually declares rather than from a
 * hard-coded form per rule kind. A velocity rule has a window and a count; a structuring
 * rule has an amount and a lookback. Writing nine forms would mean the tenth rule kind
 * cannot be tuned until somebody ships a release, which is how thresholds end up being
 * changed in a database console instead.
 *
 * Nothing here saves silently. Switching a rule on is a separate, explicit action from
 * changing its numbers, because those two mistakes have very different blast radii.
 */

'use client';

import { useState } from 'react';

import { AlertSeverity, type AmlRule } from '@reliance/contracts';
import { Alert, Button, EmptyState, FormField, Input, Select, Switch } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import { formatBasisPoints, formatCount, formatInstant, humaniseCode } from '@/lib/format';

import { useUpdateAmlRule } from '../data/use-aml';

/** What a rule parameter can be, as the contract allows. */
type ParameterValue = string | number | boolean;

const SEVERITY_OPTIONS = Object.values(AlertSeverity).map((severity) => ({
  value: severity,
  label: humaniseCode(severity),
}));

/**
 * Keeps a numeric threshold numeric while letting the operator type into it.
 *
 * A threshold that silently became the string `"10"` would be sent back to the platform as
 * one, and a rule comparing a string to a number matches nothing at all.
 */
function coerceNumber(original: number, next: string): number {
  const parsed = Number(next);
  return Number.isFinite(parsed) ? parsed : original;
}

interface ParameterFieldsProps {
  readonly values: Readonly<Record<string, ParameterValue>>;
  readonly disabled: boolean;
  readonly onChange: (key: string, value: ParameterValue) => void;
}

function ParameterFields({ values, disabled, onChange }: ParameterFieldsProps) {
  const entries = Object.entries(values);

  if (entries.length === 0) {
    return (
      <p className="font-body text-fg-muted text-sm">
        This rule has no adjustable thresholds; it fires on the pattern alone.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <ParameterField
          key={key}
          name={key}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

interface ParameterFieldProps {
  readonly name: string;
  readonly value: ParameterValue;
  readonly disabled: boolean;
  readonly onChange: (key: string, value: ParameterValue) => void;
}

function ParameterField({ name, value, disabled, onChange }: ParameterFieldProps) {
  if (typeof value === 'boolean') {
    return (
      <Switch
        checked={value}
        disabled={disabled}
        onChange={(event) => onChange(name, event.target.checked)}
      >
        {humaniseCode(name)}
      </Switch>
    );
  }

  const numeric = typeof value === 'number';

  return (
    <FormField label={humaniseCode(name)}>
      <Input
        value={String(value)}
        disabled={disabled}
        inputMode={numeric ? 'numeric' : 'text'}
        onChange={(event) =>
          onChange(name, numeric ? coerceNumber(value, event.target.value) : event.target.value)
        }
      />
    </FormField>
  );
}

function Heading({ rule }: Readonly<{ rule: AmlRule }>) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-display text-fg text-base font-semibold">{rule.name}</h3>
      <p className="font-body text-fg-muted text-sm">{rule.description}</p>
      <Performance rule={rule} />
    </div>
  );
}

function Performance({ rule }: Readonly<{ rule: AmlRule }>) {
  return (
    <p className="font-body text-fg-muted text-xs">
      Raised {formatCount(rule.alertsLast30Days)} alerts in the last 30 days, of which an estimated{' '}
      {formatBasisPoints(rule.falsePositiveRateBps)} were false positives. Last changed{' '}
      {formatInstant(rule.updatedAt)}.
    </p>
  );
}

export interface RuleEditorProps {
  readonly rule: AmlRule | null;
  /** Set when the operator may read the rule book but not change it. */
  readonly blockedReason?: string | null;
}

const ENABLED_HINT =
  'A disabled rule evaluates nothing. Replay a change before switching a rule back on.';

interface EditorBodyProps {
  readonly rule: AmlRule;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly severity: string;
  readonly disabled: boolean;
  readonly dirty: boolean;
  readonly onSeverityChange: (severity: string) => void;
  readonly onParameterChange: (key: string, value: ParameterValue) => void;
  readonly onToggleEnabled: (enabled: boolean) => void;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}

function EditorBody(props: EditorBodyProps) {
  return (
    <>
      <Switch
        checked={props.rule.enabled}
        disabled={props.disabled}
        description={ENABLED_HINT}
        onChange={(event) => props.onToggleEnabled(event.target.checked)}
      >
        {props.rule.enabled ? 'Live — this rule is evaluating traffic' : 'Switched off'}
      </Switch>

      <FormField label="Severity of the alerts it raises" className="max-w-64">
        <Select
          value={props.severity}
          options={SEVERITY_OPTIONS}
          disabled={props.disabled}
          onChange={(event) => props.onSeverityChange(event.target.value)}
        />
      </FormField>

      <ParameterFields
        values={props.parameters}
        disabled={props.disabled}
        onChange={props.onParameterChange}
      />

      <div className="flex items-center gap-2">
        <Button disabled={props.disabled || !props.dirty} onClick={props.onSave}>
          Save these thresholds
        </Button>
        {props.dirty && (
          <Button variant="ghost" disabled={props.disabled} onClick={props.onDiscard}>
            Discard changes
          </Button>
        )}
      </div>
    </>
  );
}

function NothingSelected() {
  return (
    <EmptyState
      title="Choose a rule"
      description="Select a rule to read what it does, adjust its thresholds and replay it over history."
    />
  );
}

/** The editing panel for one monitoring rule. */
export function RuleEditor({ rule, blockedReason }: RuleEditorProps) {
  const [draft, setDraft] = useState<Readonly<Record<string, ParameterValue>> | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const update = useUpdateAmlRule();

  if (!rule) return <NothingSelected />;

  const parameters = draft ?? rule.parameters;
  const chosenSeverity = severity ?? rule.severity;
  const discard = () => {
    setDraft(null);
    setSeverity(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading rule={rule} />

      {blockedReason && <Alert tone="warning">{blockedReason}</Alert>}
      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}

      <EditorBody
        rule={rule}
        parameters={parameters}
        severity={chosenSeverity}
        disabled={Boolean(blockedReason) || update.isPending}
        dirty={draft !== null || severity !== null}
        onSeverityChange={setSeverity}
        onParameterChange={(key, value) => setDraft({ ...parameters, [key]: value })}
        onToggleEnabled={(enabled) => update.mutate({ ruleId: rule.id, changes: { enabled } })}
        onSave={() =>
          update.mutate(
            {
              ruleId: rule.id,
              changes: { parameters, severity: chosenSeverity as AlertSeverity },
            },
            { onSuccess: discard },
          )
        }
        onDiscard={discard}
      />
    </div>
  );
}
