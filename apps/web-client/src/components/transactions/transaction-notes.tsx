'use client';

/**
 * Recategorising a movement, and keeping a note against it.
 *
 * Both are presentation-only. The amount, the direction and the posting behind them are
 * immutable — a correction to the money itself is a reversing entry, not an edit — and the form
 * says so, because a customer who thinks changing a category changes what was charged will not
 * ring us until the statement arrives.
 *
 * Recategorising moves money between slices of the spend donut, so the whole transaction cache is
 * dropped on success. A chart that disagrees with the row underneath it is worse than a spinner.
 */

import { useState, type FormEvent } from 'react';

import type { SpendCategory, Transaction } from '@reliance/contracts';
import { Card, CardHeader, FormField, Select, Textarea } from '@reliance/ui';

import { FailureAlert, SaveRow } from './form-parts';
import { CATEGORY_LABEL, CATEGORY_ORDER } from './labels';
import { useUpdateTransaction } from './use-transactions';

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((category) => ({
  value: category,
  label: CATEGORY_LABEL[category],
}));

const NOTE_MAX_LENGTH = 120;
const NOTE_ROWS = 3;

interface FieldsProps {
  readonly category: SpendCategory;
  readonly onCategory: (category: SpendCategory) => void;
  readonly notes: string;
  readonly onNotes: (notes: string) => void;
}

/** The category picker and the customer's private note. */
function Fields({ category, onCategory, notes, onNotes }: FieldsProps) {
  return (
    <>
      <FormField label="Category">
        <Select
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(event) => onCategory(event.target.value as SpendCategory)}
        />
      </FormField>

      <FormField
        label="Your note"
        hint={`Only you can see this. Up to ${NOTE_MAX_LENGTH} characters.`}
      >
        <Textarea
          value={notes}
          maxLength={NOTE_MAX_LENGTH}
          showCount
          rows={NOTE_ROWS}
          onChange={(event) => onNotes(event.target.value)}
        />
      </FormField>
    </>
  );
}

/** Props for {@link TransactionNotes}. */
export interface TransactionNotesProps {
  readonly transaction: Transaction;
}

/**
 * @example <TransactionNotes transaction={transaction} />
 */
export function TransactionNotes({ transaction }: TransactionNotesProps) {
  const update = useUpdateTransaction(transaction.id);
  const [category, setCategory] = useState<SpendCategory>(transaction.category);
  const [notes, setNotes] = useState(transaction.notes ?? '');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    update.mutate({ category, notes: notes.trim() || null });
  };

  const unchanged = category === transaction.category && notes.trim() === (transaction.notes ?? '');

  return (
    <Card>
      <CardHeader
        title="How this is filed"
        description="Changing the category moves it between the totals on Insights. It does not change what was charged."
      />
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <Fields category={category} onCategory={setCategory} notes={notes} onNotes={setNotes} />
        <FailureAlert error={update.error} />
        <SaveRow
          label="Save"
          pending={update.isPending}
          disabled={unchanged}
          saved={update.isSuccess && unchanged}
        />
      </form>
    </Card>
  );
}
