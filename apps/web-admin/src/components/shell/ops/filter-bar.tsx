/**
 * The filter row above a queue.
 *
 * Declarative, so a screen describes its filters rather than assembling controls, and so
 * every queue in the console filters the same way. Labels are visible and real: a row of
 * unlabelled boxes that only say what they are while empty is unusable the moment an
 * operator fills them in, and unreadable to a screen reader at any point.
 */

'use client';

import { FilterX } from 'lucide-react';
import { useId } from 'react';

import { Button, Input, Select, type SelectOption } from '@reliance/ui';

/** The kinds of filter an operational queue needs. */
export type FilterKind = 'text' | 'select' | 'date';

/** One filter control. */
export interface FilterSpec {
  /** Key this filter's value is stored under. Also the URL parameter, by convention. */
  readonly id: string;
  readonly label: string;
  readonly kind: FilterKind;
  /** Required for `select`. The empty value is added automatically as "Any". */
  readonly options?: readonly SelectOption[];
  readonly placeholder?: string;
}

/** Value meaning "this filter is not applied". */
const UNSET = '';

const LABEL = 'font-body text-xs font-medium text-fg-muted';

export interface FilterBarProps {
  readonly filters: readonly FilterSpec[];
  readonly values: Readonly<Record<string, string>>;
  readonly onChange: (values: Readonly<Record<string, string>>) => void;
}

interface FilterControlProps {
  readonly spec: FilterSpec;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}

function FilterControl({ spec, value, onValueChange }: FilterControlProps) {
  const controlId = useId();

  return (
    <span className="flex items-center gap-1.5">
      <label htmlFor={controlId} className={LABEL}>
        {spec.label}
      </label>
      {spec.kind === 'select' ? (
        <Select
          id={controlId}
          selectSize="sm"
          value={value}
          placeholder="Any"
          onChange={(event) => onValueChange(event.target.value)}
          options={spec.options ?? []}
        />
      ) : (
        <Input
          id={controlId}
          inputSize="sm"
          type={spec.kind === 'date' ? 'date' : 'search'}
          value={value}
          placeholder={spec.placeholder}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
    </span>
  );
}

/** Counts the filters the operator has actually applied. */
function appliedCount(values: Readonly<Record<string, string>>): number {
  return Object.values(values).filter((value) => value !== UNSET).length;
}

/** A row of filter controls with a way back to an unfiltered queue. */
export function FilterBar({ filters, values, onChange }: FilterBarProps) {
  const applied = appliedCount(values);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {filters.map((spec) => (
        <FilterControl
          key={spec.id}
          spec={spec}
          value={values[spec.id] ?? UNSET}
          onValueChange={(value) => onChange({ ...values, [spec.id]: value })}
        />
      ))}

      {applied > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({})}
          startIcon={<FilterX className="size-4" />}
        >
          Clear {applied} filter{applied === 1 ? '' : 's'}
        </Button>
      )}
    </div>
  );
}
