/**
 * The credit interest table.
 *
 * Tiers are balance bands with a rate each, and the thing that goes wrong is a gap or an
 * overlap between bands — a balance that falls in neither, or in two. The editor keeps
 * the bands in order and states the upper bound of the last one as "and above" rather
 * than leaving it blank, because a blank is how a gap gets published.
 *
 * Rates are integer basis points throughout. There is no path from this form to a float.
 */

'use client';

import { Plus, Trash2 } from 'lucide-react';

import type { InterestTier } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Button, CurrencyInput, Input, MoneyText } from '@reliance/ui';

import { TableHead } from '@/components/ops';
import { formatBasisPoints } from '@/lib/format';

const CELL = 'px-2 py-2 align-middle';
const HEAD = 'px-2 py-2 text-left font-medium text-fg-muted';

export interface RateTiersEditorProps {
  readonly tiers: readonly InterestTier[];
  readonly currency: CurrencyCode;
  readonly onChange: (tiers: readonly InterestTier[]) => void;
}

function emptyTier(currency: CurrencyCode): InterestTier {
  return { fromAmount: { amount: '0', currency }, toAmount: null, annualRateBps: 0 };
}

interface RowProps {
  readonly tier: InterestTier;
  readonly currency: CurrencyCode;
  readonly onPatch: (patch: Partial<InterestTier>) => void;
  readonly onRemove: () => void;
}

/** The top band has no ceiling, so every balance falls in exactly one band. */
function UpperBoundCell({
  tier,
  currency,
  onPatch,
}: {
  readonly tier: InterestTier;
  readonly currency: CurrencyCode;
  readonly onPatch: (change: Partial<InterestTier>) => void;
}) {
  return (
    <td className={CELL}>
      {tier.toAmount === null ? (
        <span className="font-body text-fg-muted text-sm">and above</span>
      ) : (
        <CurrencyInput
          currency={currency}
          value={tier.toAmount.amount}
          aria-label="Band ends at"
          onValueChange={(amount) => onPatch({ toAmount: { amount, currency } })}
        />
      )}
    </td>
  );
}

function TierRow({ tier, currency, onPatch, onRemove }: RowProps) {
  return (
    <tr className="border-border border-b last:border-0">
      <td className={CELL}>
        <CurrencyInput
          currency={currency}
          value={tier.fromAmount.amount}
          aria-label="Band starts at"
          onValueChange={(amount) => onPatch({ fromAmount: { amount, currency } })}
        />
      </td>
      <UpperBoundCell tier={tier} currency={currency} onPatch={onPatch} />
      <td className={CELL}>
        <Input
          inputSize="sm"
          inputMode="numeric"
          aria-label="Annual rate in basis points"
          value={String(tier.annualRateBps)}
          suffix={<span className="text-fg-muted text-xs">bps</span>}
          onChange={(event) => onPatch({ annualRateBps: Number(event.target.value) || 0 })}
        />
      </td>
      <td className={`${CELL} text-right`}>{formatBasisPoints(tier.annualRateBps)}</td>
      <td className={`${CELL} text-right`}>
        <Button size="sm" variant="ghost" iconOnly aria-label="Remove this band" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  );
}

/** The heading row. The last column holds only a remove button, so its label is for readers of the accessibility tree alone. */
function TierTableHead() {
  return (
    <TableHead
      className={HEAD}
      headings={[
        'Balance from',
        'Up to',
        'Annual rate',
        { label: 'Reads as', align: 'right' },
        { label: 'Remove', align: 'right', visuallyHidden: true },
      ]}
    />
  );
}

/** The band table. Headings are static, so they are listed rather than written out. */
function TierTable({
  tiers,
  currency,
  onPatch,
  onChange,
}: {
  readonly tiers: readonly InterestTier[];
  readonly currency: CurrencyCode;
  readonly onPatch: (index: number, change: Partial<InterestTier>) => void;
  readonly onChange: (next: readonly InterestTier[]) => void;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">Credit interest bands and the rate paid on each</caption>
        <TierTableHead />
        <tbody>
          {tiers.map((tier, index) => (
            <TierRow
              key={`${tier.fromAmount.amount}-${tier.toAmount?.amount ?? 'above'}`}
              tier={tier}
              currency={currency}
              onPatch={(change) => onPatch(index, change)}
              onRemove={() => onChange(tiers.filter((_, position) => position !== index))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The balance bands and the rate paid on each. */
export function RateTiersEditor({ tiers, currency, onChange }: RateTiersEditorProps) {
  const patch = (index: number, change: Partial<InterestTier>): void => {
    onChange(tiers.map((tier, position) => (position === index ? { ...tier, ...change } : tier)));
  };

  return (
    <div className="flex flex-col gap-3">
      <TierTable tiers={tiers} currency={currency} onPatch={patch} onChange={onChange} />

      <div className="flex items-center justify-between gap-3">
        <span className="font-body text-fg-muted text-xs">
          The last band should have no upper bound, so every balance falls in exactly one.
        </span>
        <Button
          size="sm"
          variant="secondary"
          startIcon={<Plus className="size-4" />}
          onClick={() => onChange([...tiers, emptyTier(currency)])}
        >
          Add a band
        </Button>
      </div>

      {tiers.length > 0 && (
        <p className="font-body text-fg-muted text-xs">
          Top rate on this product:{' '}
          {formatBasisPoints(Math.max(...tiers.map((tier) => tier.annualRateBps)))} on balances from{' '}
          <MoneyText
            amount={tiers[tiers.length - 1]?.fromAmount.amount ?? '0'}
            currency={currency}
            size="sm"
            muted
          />
          .
        </p>
      )}
    </div>
  );
}
