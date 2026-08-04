/**
 * A journal entry, with both sides of it on screen at once.
 *
 * This is the screen the whole console is arranged around. A customer-facing transaction
 * is one side of an entry; the entry is the system of record, and an operator who can
 * only see the side that touched the customer cannot answer the question that actually
 * gets asked — where did the other half of this money go.
 *
 * So both columns are always rendered, side by side, and the totals are footed underneath
 * them. Debits sit left and credits right, which is the arrangement every ledger, journal
 * and accounting textbook uses; putting them in a single signed column would be denser
 * and would make the entry unreadable to the people who need it most.
 */

'use client';

import { PostingDirection, type JournalEntry, type Posting } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { MoneyText, StatusPill } from '@reliance/ui';

import { TableHead, toneForEntry } from '@/components/ops';
import { formatDate, formatInstant, humaniseCode } from '@/lib/format';

import { BalanceAssertion } from './balance-assertion';
import { entryBalance } from './entry-balance';

const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';
const CELL = 'px-3 py-2 align-top';
const NUMERIC = 'px-3 py-2 text-right align-top tabular-nums';

/**
 * A stable identity for a posting.
 *
 * Postings carry no id of their own — they are parts of an immutable entry, not records —
 * so the key is built from what makes one distinguishable. The array index would be
 * wrong the moment an entry is rendered next to a reversal of itself.
 */
function postingKey(posting: Posting): string {
  return [
    posting.ledgerAccountCode,
    posting.direction,
    posting.amount.amount,
    posting.accountId ?? '',
    posting.narrative,
  ].join('|');
}

function AccountCell({ posting }: Readonly<{ posting: Posting }>) {
  return (
    <span className="flex flex-col">
      <span className="text-fg font-medium">
        <span className="text-fg-muted font-mono text-xs">{posting.ledgerAccountCode}</span>{' '}
        {posting.ledgerAccountName}
      </span>
      <span className="text-fg-muted text-xs">{posting.narrative}</span>
      {posting.accountId && (
        <span className="text-fg-subtle font-mono text-xs">{posting.accountId}</span>
      )}
    </span>
  );
}

function PostingRow({ posting }: Readonly<{ posting: Posting }>) {
  const isDebit = posting.direction === PostingDirection.DEBIT;
  const amount = (
    <MoneyText
      amount={posting.amount.amount}
      currency={posting.amount.currency}
      display="none"
      size="sm"
      muted
    />
  );

  return (
    <tr className="border-border border-b last:border-0">
      <td className={CELL}>
        <AccountCell posting={posting} />
      </td>
      <td className={NUMERIC}>{isDebit ? amount : null}</td>
      <td className={NUMERIC}>{isDebit ? null : amount}</td>
    </tr>
  );
}

function EntryHeader({ entry }: Readonly<{ entry: JournalEntry }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-fg text-sm font-semibold">{entry.description}</span>
        <span className="font-body text-fg-muted text-xs">
          {humaniseCode(entry.type)} · value {formatDate(entry.valueDate)} · booked{' '}
          {formatInstant(entry.bookedAt)}
        </span>
      </div>
      <StatusPill tone={toneForEntry(entry.status)} label={humaniseCode(entry.status)} />
    </div>
  );
}

export interface JournalEntryViewProps {
  readonly entry: JournalEntry;
}

/** Every posting on one entry, debits left, credits right, footed. */
/** The two column sums. An entry whose sums differ is a broken entry. */
function TotalsRow({
  debits,
  credits,
  currency,
}: {
  readonly debits: string;
  readonly credits: string;
  readonly currency: CurrencyCode;
}) {
  const total = (amount: string) => (
    <MoneyText amount={amount} currency={currency} display="none" size="sm" muted />
  );

  return (
    <tfoot>
      <tr className="border-border-strong border-t font-medium">
        <th scope="row" className={`${HEAD} text-fg`}>
          Totals
        </th>
        <td className={NUMERIC}>{total(debits)}</td>
        <td className={NUMERIC}>{total(credits)}</td>
      </tr>
    </tfoot>
  );
}

/**
 * Both sides of the entry, debits and credits in their own columns.
 *
 * The totals row is the point of the view: an entry whose columns do not agree is a broken
 * entry, and putting the two sums directly beneath the postings is what makes that
 * checkable at a glance.
 */
function PostingsTable({
  entry,
  balance,
  currency,
}: {
  readonly entry: JournalEntryViewProps['entry'];
  readonly balance: ReturnType<typeof entryBalance>;
  readonly currency: CurrencyCode;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">
          Every posting on journal entry {entry.reference}, with debits and credits in separate
          columns
        </caption>
        <TableHead
          className={HEAD}
          headings={[
            'Ledger account',
            { label: 'Debit', align: 'right' },
            { label: 'Credit', align: 'right' },
          ]}
        />
        <tbody>
          {entry.postings.map((posting) => (
            <PostingRow key={postingKey(posting)} posting={posting} />
          ))}
        </tbody>
        <TotalsRow debits={balance.debits} credits={balance.credits} currency={currency} />
      </table>
    </div>
  );
}

export function JournalEntryView({ entry }: JournalEntryViewProps) {
  const balance = entryBalance(entry.postings);
  const currency = balance.currency ?? entry.postings[0]?.amount.currency ?? 'GBP';

  return (
    <div className="flex flex-col gap-3">
      <EntryHeader entry={entry} />
      <PostingsTable entry={entry} balance={balance} currency={currency} />

      <BalanceAssertion
        balanced={balance.balanced}
        difference={{ amount: balance.difference, currency }}
        subject="this entry"
      />
    </div>
  );
}
