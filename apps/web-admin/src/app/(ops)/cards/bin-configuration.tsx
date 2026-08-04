/**
 * The bank's issuing ranges.
 *
 * A BIN range is not a setting a console toggles: it is registered with the scheme, it
 * determines how every acquirer in the world routes an authorisation to us, and changing
 * one is a scheme filing with a lead time measured in weeks. What an operator needs from
 * this screen is therefore the register itself — which range a card came from, what it is
 * used for, and who to talk to — rather than an edit control that would be a lie.
 */

'use client';

import { CardFormat, CardScheme, CardTier } from '@reliance/contracts';
import { Alert, Badge } from '@reliance/ui';

import { Panel, TableHead } from '@/components/ops';
import { humaniseCode } from '@/lib/format';

/** One registered issuing range. */
interface BinRange {
  readonly prefix: string;
  readonly scheme: CardScheme;
  readonly format: CardFormat;
  readonly tier: CardTier;
  readonly currency: string;
  readonly purpose: string;
}

/** The ranges Reliance Bank issues against, as registered with the schemes. */
const RANGES: readonly BinRange[] = [
  {
    prefix: '400000',
    scheme: CardScheme.VISA,
    format: CardFormat.PHYSICAL,
    tier: CardTier.STANDARD,
    currency: 'GBP',
    purpose: 'Everyday personal debit cards issued on sterling current accounts.',
  },
  {
    prefix: '400001',
    scheme: CardScheme.VISA,
    format: CardFormat.VIRTUAL,
    tier: CardTier.STANDARD,
    currency: 'GBP',
    purpose: 'Virtual cards, including single-merchant cards for subscriptions.',
  },
  {
    prefix: '400002',
    scheme: CardScheme.VISA,
    format: CardFormat.PHYSICAL,
    tier: CardTier.PREMIUM,
    currency: 'GBP',
    purpose: 'Premium accounts, with travel cover and higher cash-machine limits.',
  },
  {
    prefix: '555555',
    scheme: CardScheme.MASTERCARD,
    format: CardFormat.PHYSICAL,
    tier: CardTier.STANDARD,
    currency: 'EUR',
    purpose: 'Euro current accounts held by customers resident in the euro area.',
  },
  {
    prefix: '222300',
    scheme: CardScheme.MASTERCARD,
    format: CardFormat.PHYSICAL,
    tier: CardTier.METAL,
    currency: 'GBP',
    purpose: 'Metal cards for private banking, issued on request by the relationship desk.',
  },
];

const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';
const CELL = 'px-3 py-2 align-top';

function RangeRow({ range }: Readonly<{ range: BinRange }>) {
  return (
    <tr className="border-border border-b last:border-0">
      <td className={CELL}>
        <span className="font-mono">{range.prefix}</span>
      </td>
      <td className={CELL}>{humaniseCode(range.scheme)}</td>
      <td className={CELL}>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge>{humaniseCode(range.format)}</Badge>
          <Badge tone="accent">{humaniseCode(range.tier)}</Badge>
        </span>
      </td>
      <td className={CELL}>{range.currency}</td>
      <td className={CELL}>{range.purpose}</td>
    </tr>
  );
}

/** The issuing ranges, and what each one is for. */
export function BinConfiguration() {
  return (
    <Panel
      title="Issuing ranges"
      description="The bank identification numbers Reliance Bank issues against, and what each range carries."
    >
      <div className="flex flex-col gap-4">
        <Alert tone="info" title="Changing a range is a scheme filing">
          Ranges are registered with Visa and Mastercard and determine how every acquirer routes an
          authorisation to us. Card Operations raise changes with the scheme; they cannot be made
          here, and a range in use is never withdrawn while live cards remain on it.
        </Alert>

        <div className="border-border overflow-x-auto rounded-md border">
          <table className="font-body w-full border-collapse text-sm">
            <caption className="sr-only">Registered issuing ranges</caption>
            <TableHead
              className={HEAD}
              headings={['Range', 'Scheme', 'Issues', 'Currency', 'What it is used for']}
            />
            <tbody>
              {RANGES.map((range) => (
                <RangeRow key={range.prefix} range={range} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
