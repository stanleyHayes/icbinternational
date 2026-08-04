'use client';

/**
 * What is about to leave the account.
 *
 * Standing orders and Direct Debits due in the next month, soonest first. A variable Direct Debit
 * shows "Amount varies" rather than a guess: a water bill the bank invented a figure for is worse
 * than no figure, because the customer will budget against it.
 *
 * The total at the bottom counts only the amounts we actually know. It says so, because a total
 * that quietly omits three variable bills is a total that will be wrong on the day.
 */

import type { Money } from '@reliance/contracts';
import { MoneyText, StatusPill, cn, TEXT_STYLE } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { BASE_CURRENCY } from '@/components/transactions/totals';
import { relativeTime } from '@/lib/format';
import { appRoutes } from '@/lib/routes';

import { Panel } from './panel';
import { useCommitments, type Commitment } from './use-dashboard';

const ROWS = 4;
const ROW_HEIGHT = 56;
const FOOTER_HEIGHT = 32;
const BODY_HEIGHT = ROWS * ROW_HEIGHT + FOOTER_HEIGHT;

/** Sums only the commitments whose amount is known, in the leading currency. */
function knownTotal(commitments: readonly Commitment[]): {
  readonly total: Money;
  readonly unknown: number;
} {
  const currency = commitments.find((entry) => entry.amount)?.amount?.currency ?? BASE_CURRENCY;
  let minor = 0n;
  let unknown = 0;

  for (const commitment of commitments) {
    if (!commitment.amount || commitment.amount.currency !== currency) {
      unknown += 1;
      continue;
    }
    const value = BigInt(commitment.amount.amount);
    minor += value < 0n ? -value : value;
  }

  return { total: { amount: minor.toString(), currency }, unknown };
}

function Row({ commitment }: { readonly commitment: Commitment }) {
  return (
    <li className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-fg truncate font-medium">{commitment.name}</p>
        <p className="text-fg-muted text-sm">
          {`${commitment.kind} · ${relativeTime(commitment.dueAt)}`}
        </p>
      </div>
      {commitment.amount ? (
        <MoneyText
          amount={`-${commitment.amount.amount.replace('-', '')}`}
          currency={commitment.amount.currency}
          signed
        />
      ) : (
        <StatusPill tone="neutral" label="Amount varies" />
      )}
    </li>
  );
}

/** The rows, and the total of the ones whose amount we actually know. */
function Schedule({ shown }: { readonly shown: readonly Commitment[] }) {
  const { total, unknown } = knownTotal(shown);

  return (
    <>
      <ul className="flex flex-col">
        {shown.map((commitment) => (
          <Row key={commitment.id} commitment={commitment} />
        ))}
      </ul>
      <p className={cn(TEXT_STYLE.caption, 'mt-3 flex flex-wrap items-center gap-1')}>
        <span>About</span>
        <MoneyText amount={total.amount} currency={total.currency} size="sm" muted />
        <span>
          {unknown === 0 ? 'due in the next month.' : `due, plus ${unknown} whose amount varies.`}
        </span>
      </p>
    </>
  );
}

/** Standing orders and Direct Debits due soon. */
export function UpcomingBills() {
  const commitments = useCommitments();
  const shown = commitments.upcoming.slice(0, ROWS);

  return (
    <Panel
      title="Going out soon"
      description="Standing orders and Direct Debits due in the next month."
      minBodyHeight={BODY_HEIGHT}
      loading={commitments.isPending}
      error={commitments.isError ? commitments.error : undefined}
      action={
        <LinkButton href={appRoutes.payments} variant="ghost">
          Manage
        </LinkButton>
      }
    >
      {shown.length === 0 ? (
        <EmptyPanel
          bordered={false}
          title="Nothing scheduled"
          description="Standing orders and Direct Debits you set up will appear here, with the date each one is due."
        />
      ) : (
        <Schedule shown={shown} />
      )}
    </Panel>
  );
}
