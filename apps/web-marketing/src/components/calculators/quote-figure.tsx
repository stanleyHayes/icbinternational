import type { Money } from '@reliance/contracts';
import { cn, MoneyText } from '@reliance/ui';

/**
 * One figure in a calculator result.
 *
 * `aria-live` sits on the container in the calculator, not here: announcing four figures
 * separately as they update would talk over itself. The label is bound to the value with
 * a description list so a screen reader reads "Monthly payment, £412.87".
 *
 * Every figure is `muted`. Direction is already stated in the label, and the brand's money
 * colours mean one thing only — a repayment rendered in credit green would say the money
 * was coming towards the customer.
 */
export function QuoteFigure({
  label,
  amount,
  emphasis = false,
}: {
  readonly label: string;
  readonly amount: Money;
  readonly emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={cn('text-fg mt-1', emphasis && 'font-semibold')}>
        <MoneyText
          amount={amount.amount}
          currency={amount.currency}
          size={emphasis ? 'xl' : 'lg'}
          muted
        />
      </dd>
    </div>
  );
}

/** A non-monetary figure in the same visual language — a rate, a term, a date. */
export function QuoteFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="font-display text-fg mt-1 text-lg font-medium">{value}</dd>
    </div>
  );
}
