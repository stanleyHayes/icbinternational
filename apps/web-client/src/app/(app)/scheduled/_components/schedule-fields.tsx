'use client';

/**
 * When and how often the payment runs.
 *
 * The day picker changes with the frequency, and the month-end rule is spelled out under the
 * day-of-month field rather than buried in terms. "The 31st" is a date that does not exist in
 * seven months of the year, and a customer who picks it deserves to be told what we will do.
 */

import { FormField, Input, Select } from '@reliance/ui';

import {
  DAY_OF_MONTH_OPTIONS,
  DAY_OF_WEEK_OPTIONS,
  FREQUENCY_OPTIONS,
  MONTH_END_NOTE,
  MONTHLY_LIKE,
  WEEKLY_LIKE,
} from './frequency';
import type { OrderDraft } from './use-order-form';

/** Props for {@link ScheduleFields}. */
export interface ScheduleFieldsProps {
  readonly draft: OrderDraft;
  readonly onChange: (patch: Partial<OrderDraft>) => void;
}

/** The weekday or day-of-month picker the chosen frequency calls for. */
function DayField({ draft, onChange }: ScheduleFieldsProps) {
  if (MONTHLY_LIKE.has(draft.frequency)) {
    return (
      <FormField label="Day of the month" hint={MONTH_END_NOTE} required>
        <Select
          options={DAY_OF_MONTH_OPTIONS}
          value={draft.dayOfMonth}
          onChange={(event) => onChange({ dayOfMonth: event.target.value })}
        />
      </FormField>
    );
  }

  if (WEEKLY_LIKE.has(draft.frequency)) {
    return (
      <FormField label="Day of the week" required>
        <Select
          options={DAY_OF_WEEK_OPTIONS}
          value={draft.dayOfWeek}
          onChange={(event) => onChange({ dayOfWeek: event.target.value })}
        />
      </FormField>
    );
  }

  return null;
}

/**
 * @example <ScheduleFields draft={draft} onChange={patch} />
 */
export function ScheduleFields({ draft, onChange }: ScheduleFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="How often" required>
        <Select
          options={FREQUENCY_OPTIONS}
          value={draft.frequency}
          onChange={(event) =>
            onChange({ frequency: event.target.value as OrderDraft['frequency'] })
          }
        />
      </FormField>

      <DayField draft={draft} onChange={onChange} />

      <FormField label="First payment" required>
        <Input
          type="date"
          value={draft.startsOn}
          onChange={(event) => onChange({ startsOn: event.target.value })}
        />
      </FormField>

      <FormField
        label="Last payment"
        hint="Leave this empty and the standing order runs until you stop it."
      >
        <Input
          type="date"
          value={draft.endsOn}
          onChange={(event) => onChange({ endsOn: event.target.value })}
        />
      </FormField>
    </div>
  );
}
