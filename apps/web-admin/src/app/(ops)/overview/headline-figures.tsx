/**
 * The four numbers an operations manager checks first.
 *
 * The ledger difference is on this row deliberately, and it is on it even when it is
 * zero. A control that only appears when something is wrong is a control nobody trusts,
 * because its silence cannot be told apart from its absence — so the book's footing is
 * stated every time the screen is opened.
 */

'use client';

import { Coins, Landmark, Receipt, Scale } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Money } from '@reliance/contracts';
import { MoneyText, type Tone } from '@reliance/ui';

import { AsyncState, isZeroMinor, KpiTile } from '@/components/ops';
import { formatCount } from '@/lib/format';

import { useLedgerSnapshot, useLivePostings } from './use-overview';

const ICON = 'size-3.5';

/** Shown in place of a figure the platform has not returned. */
const NOT_SET = '—';

const BALANCED_HINT = 'Debits equal credits. The book foots.';
const BROKEN_HINT = 'Debits do not equal credits. Escalate to Financial Control now.';

interface MoneyTileProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly money: Money | undefined;
  readonly hint: string;
  readonly tone?: Tone;
}

function MoneyTile({ label, icon, money, hint, tone }: MoneyTileProps) {
  return (
    <KpiTile
      label={label}
      icon={icon}
      {...(tone ? { tone } : {})}
      hint={hint}
      value={
        money ? (
          <MoneyText amount={money.amount} currency={money.currency} size="xl" muted />
        ) : (
          NOT_SET
        )
      }
    />
  );
}

/**
 * Derived from the hook rather than imported by name, so it follows the contract the
 * query actually returns — including being `undefined` before the first response.
 */
type LedgerSnapshot = ReturnType<typeof useLedgerSnapshot>['data'];

/** The three balance tiles. A non-zero difference is the one that changes colour. */
function BookTiles({ book }: { readonly book: LedgerSnapshot }) {
  const balanced = book ? isZeroMinor(book.difference.amount) : true;

  return (
    <>
      <MoneyTile
        label="Customer deposits"
        icon={<Coins className={ICON} />}
        tone="credit"
        money={book?.totalCredits}
        hint="Total credits on the book. What the bank owes its customers."
      />
      <MoneyTile
        label="Assets on the book"
        icon={<Landmark className={ICON} />}
        money={book?.totalDebits}
        hint="Total debits: cash at the central bank, nostro balances and lending."
      />
      <MoneyTile
        label="Ledger difference"
        icon={<Scale className={ICON} />}
        tone={balanced ? 'success' : 'danger'}
        money={book?.difference}
        hint={balanced ? BALANCED_HINT : BROKEN_HINT}
      />
    </>
  );
}

/** Feed volume, labelled with how it is being kept up to date. */
function VolumeTile({
  volume,
  streaming,
}: {
  readonly volume: number;
  readonly streaming: boolean;
}) {
  return (
    <KpiTile
      label="Postings on the feed"
      icon={<Receipt className={ICON} />}
      live
      value={formatCount(volume)}
      hint={streaming ? 'Arriving live from the platform.' : 'Refreshed every fifteen seconds.'}
    />
  );
}

/** Headline balances and volumes. */
export function HeadlineFigures() {
  const ledger = useLedgerSnapshot();
  const postings = useLivePostings();
  const volume = postings.data?.page.total ?? postings.data?.data.length ?? 0;

  return (
    <AsyncState
      isLoading={ledger.isPending && ledger.isFetching}
      error={ledger.error}
      onRetry={() => void ledger.refetch()}
      subject="the bank's headline balances"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BookTiles book={ledger.data} />
        <VolumeTile volume={volume} streaming={postings.transport === 'stream'} />
      </div>
    </AsyncState>
  );
}
