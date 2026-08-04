/**
 * The limit matrix.
 *
 * Five scopes, four ceilings each. Limits are the control customers notice most and
 * complain about most, and the failure that generates the complaints is a daily limit set
 * below a per-payment one — a combination that looks fine on each row and is impossible
 * to satisfy. The editor states that relationship rather than leaving it to be discovered.
 */

'use client';

import type { LimitMatrix, Product } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { CurrencyInput, Input } from '@reliance/ui';

import { TableHead } from '@/components/ops';

const CELL = 'px-2 py-2 align-middle';
const HEAD = 'px-2 py-2 text-left font-medium text-fg-muted';

/** The scopes a product sets limits on, in the order a customer meets them. */
type Scope = keyof Product['limits'];

const SCOPE_LABEL: Readonly<Record<Scope, string>> = {
  internalTransfer: 'Between own accounts',
  domesticTransfer: 'Domestic transfers',
  internationalTransfer: 'International transfers',
  cardSpend: 'Card spending',
  atmWithdrawal: 'Cash machine withdrawals',
};

const SCOPES = Object.keys(SCOPE_LABEL) as readonly Scope[];

export interface LimitMatrixEditorProps {
  readonly limits: Product['limits'];
  readonly currency: CurrencyCode;
  readonly onChange: (limits: Product['limits']) => void;
}

interface RowProps {
  readonly scope: Scope;
  readonly limit: LimitMatrix;
  readonly currency: CurrencyCode;
  readonly onPatch: (patch: Partial<LimitMatrix>) => void;
}

function amountCell(
  label: string,
  value: { readonly amount: string } | null,
  currency: CurrencyCode,
  onValueChange: (amount: string) => void,
) {
  return (
    <CurrencyInput
      currency={currency}
      value={value?.amount ?? '0'}
      aria-label={label}
      onValueChange={onValueChange}
    />
  );
}

function LimitRow({ scope, limit, currency, onPatch }: RowProps) {
  const label = SCOPE_LABEL[scope];

  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className={`${CELL} text-left font-normal`}>
        {label}
      </th>
      <td className={CELL}>
        {amountCell(`Per payment limit for ${label}`, limit.perTransaction, currency, (amount) =>
          onPatch({ perTransaction: { amount, currency } }),
        )}
      </td>
      <td className={CELL}>
        {amountCell(`Daily limit for ${label}`, limit.daily, currency, (amount) =>
          onPatch({ daily: { amount, currency } }),
        )}
      </td>
      <td className={CELL}>
        {amountCell(`Monthly limit for ${label}`, limit.monthly, currency, (amount) =>
          onPatch({ monthly: { amount, currency } }),
        )}
      </td>
      <td className={CELL}>
        <Input
          inputSize="sm"
          inputMode="numeric"
          aria-label={`Payments a day for ${label}`}
          value={limit.dailyCount === null ? '' : String(limit.dailyCount)}
          placeholder="No cap"
          onChange={(event) =>
            onPatch({ dailyCount: event.target.value === '' ? null : Number(event.target.value) })
          }
        />
      </td>
    </tr>
  );
}

/** Every limit the product sets, by scope. */
export function LimitMatrixEditor({ limits, currency, onChange }: LimitMatrixEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="font-body w-full border-collapse text-sm">
          <caption className="sr-only">Limits by scope for this product version</caption>
          <TableHead
            className={HEAD}
            headings={['Scope', 'Per payment', 'Each day', 'Each month', 'Payments a day']}
          />
          <tbody>
            {SCOPES.map((scope) => (
              <LimitRow
                key={scope}
                scope={scope}
                limit={limits[scope]}
                currency={currency}
                onPatch={(patch) =>
                  onChange({ ...limits, [scope]: { ...limits[scope], ...patch } })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-body text-fg-muted text-xs">
        A daily limit below the per-payment limit means the larger figure can never be reached. Keep
        each ceiling at or above the one to its left.
      </p>
    </div>
  );
}
