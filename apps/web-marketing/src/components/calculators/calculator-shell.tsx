'use client';

import type { FormEvent, ReactNode } from 'react';

import { Button } from '@reliance/ui';

export interface CalculatorShellProps {
  readonly title: string;
  readonly intro: ReactNode;
  /** Names the group of controls for a screen reader. Never rendered visually. */
  readonly legend: string;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** The question fields. */
  readonly children: ReactNode;
  /** The answer, rendered beside the form on a wide screen and beneath it on a narrow one. */
  readonly result: ReactNode;
}

/**
 * The frame both calculators share: a form on the left, an answer on the right.
 *
 * `noValidate` turns off the browser's own bubble messages so the server's validation —
 * the same rules the API applies — is the only voice the customer hears. The fieldset is
 * disabled while a quote is in flight, which is what stops a second click producing a
 * second, contradictory answer.
 */
export function CalculatorShell(props: CalculatorShellProps) {
  const { title, intro, legend, submitLabel, pending, onSubmit, children, result } = props;

  return (
    <div className="border-border bg-surface grid gap-8 rounded-2xl border p-6 md:p-8 lg:grid-cols-2">
      <form onSubmit={onSubmit} noValidate>
        <h3 className="font-display text-fg text-xl font-semibold">{title}</h3>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">{intro}</p>

        <fieldset className="mt-6 space-y-5 border-0 p-0" disabled={pending}>
          <legend className="sr-only">{legend}</legend>
          {children}
          <Button type="submit" size="lg" loading={pending} fullWidth>
            {submitLabel}
          </Button>
        </fieldset>
      </form>

      {result}
    </div>
  );
}
