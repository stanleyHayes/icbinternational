'use client';

import { formatAer } from '@/lib/format';

import { CalculatorShell } from './calculator-shell';
import { ProjectionPanel } from './projection-panel';
import { SavingsInputs } from './savings-inputs';
import { useSavingsProjection } from './use-savings-projection';

/**
 * The savings growth projection.
 *
 * Compounding happens on the server in integer minor units, one month at a time. Doing it
 * here with a `Math.pow` would produce a total a penny or two away from the interest the
 * account actually pays, and the first person to notice would be a customer comparing this
 * page with their statement.
 */
export function SavingsCalculator({ annualRateBps }: { readonly annualRateBps: number }) {
  const form = useSavingsProjection(annualRateBps);

  return (
    <CalculatorShell
      title="What could it grow to?"
      intro={`Projected at today’s ${formatAer(annualRateBps)}, compounded monthly. The rate is variable, so the real figure will move with it.`}
      legend="Savings details"
      submitLabel="Project my savings"
      pending={form.pending}
      onSubmit={form.submit}
      result={<ProjectionPanel projection={form.projection} message={form.error.message} />}
    >
      <SavingsInputs
        initialDeposit={form.initialDeposit}
        onInitialChange={form.setInitialDeposit}
        monthlyContribution={form.monthlyContribution}
        onMonthlyChange={form.setMonthlyContribution}
        months={form.months}
        onMonthsChange={form.setMonths}
        errors={form.error.fieldErrors}
      />
    </CalculatorShell>
  );
}
