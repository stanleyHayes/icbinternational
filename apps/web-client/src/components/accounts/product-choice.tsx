'use client';

/**
 * Choosing which account to open.
 *
 * The terms are on the card, not behind a link. A customer choosing between a current account and
 * a saver is choosing between a rate, a fee and a minimum balance, and burying any of the three
 * one click away turns an informed choice into a guess. Every figure comes from the product
 * record, so a repricing changes this screen without anybody editing it.
 */

import type { Product } from '@reliance/contracts';
import { Badge, cn, MoneyText, Radio, RadioGroup } from '@reliance/ui';

import { formatRateBps } from './labels';

/** Name of the radio group; shared by every option so the arrow keys move between them. */
const GROUP_NAME = 'product';

function headlineRate(product: Product): string | null {
  const best = product.creditInterestTiers.at(-1);
  return best ? formatRateBps(best.annualRateBps) : null;
}

function Terms({ product }: { readonly product: Product }) {
  const rate = headlineRate(product);
  const { monthlyFee, minOpeningBalance } = product;

  return (
    <span className="text-fg-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {rate ? <span>{`Interest ${rate}`}</span> : null}
      <span className="flex items-center gap-1">
        Monthly fee
        <MoneyText amount={monthlyFee.amount} currency={monthlyFee.currency} size="sm" muted />
      </span>
      <span className="flex items-center gap-1">
        To open
        <MoneyText
          amount={minOpeningBalance.amount}
          currency={minOpeningBalance.currency}
          size="sm"
          muted
        />
      </span>
    </span>
  );
}

/** Props for {@link ProductChoice}. */
export interface ProductChoiceProps {
  readonly products: readonly Product[];
  readonly value: string;
  readonly onChange: (productCode: string) => void;
}

/**
 * @example <ProductChoice products={products} value={code} onChange={setCode} />
 */
export function ProductChoice({ products, value, onChange }: ProductChoiceProps) {
  return (
    <RadioGroup legend="Which account would you like to open?" name={GROUP_NAME}>
      {products.map((product) => (
        <div
          key={product.code}
          className={cn(
            'rounded-lg border p-4',
            value === product.code ? 'border-accent bg-accent-soft/30' : 'border-border bg-surface',
          )}
        >
          <Radio
            name={GROUP_NAME}
            value={product.code}
            checked={value === product.code}
            onChange={() => onChange(product.code)}
            description={
              <>
                <span className="block">{product.tagline}</span>
                <Terms product={product} />
                <span className="mt-2 flex flex-wrap gap-1">
                  {product.features.map((feature) => (
                    <Badge key={feature} tone="neutral">
                      {feature}
                    </Badge>
                  ))}
                </span>
              </>
            }
          >
            <span className="font-display text-fg text-base font-semibold">{product.name}</span>
          </Radio>
        </div>
      ))}
    </RadioGroup>
  );
}
