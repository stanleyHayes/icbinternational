/**
 * The running commentary on a case.
 *
 * Investigations are handed between analysts, and the only thing that survives the
 * handover is what somebody wrote down. Notes are therefore append-only in the interface
 * as well as in the platform: there is no edit control, because a note an analyst can
 * revise after the outcome is known is not evidence of anything.
 *
 * Every note is stamped with who wrote it and when, in the console's fixed-width UTC, so
 * two colleagues reading the same case agree on the order events happened in.
 */

'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';

import { Button, EmptyState, FormField, Textarea } from '@reliance/ui';

import { formatInstant } from '@/lib/format';

/** A note is a sentence, not a word. */
const MIN_NOTE_LENGTH = 8;

const TOO_SHORT = 'Write a little more — this note is the record another analyst will read.';

const NOTE_HINT = 'Recorded against your staff account. Notes cannot be edited or removed.';

/** One entry in a case's note thread. */
export interface CaseNote {
  readonly authorName: string;
  readonly body: string;
  readonly at: string;
}

export interface NoteThreadProps {
  readonly notes: readonly CaseNote[];
  readonly onAdd: (body: string) => void;
  readonly isAdding?: boolean;
  /** Set when the operator may read the case but not contribute to it. */
  readonly readOnly?: boolean;
}

function NoteList({ notes }: Readonly<{ notes: readonly CaseNote[] }>) {
  if (notes.length === 0) {
    return (
      <EmptyState
        title="No notes yet"
        description="The first note should say why this case was opened and what you are looking for."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {notes.map((note) => (
        <li
          key={`${note.at}-${note.authorName}`}
          className="border-border bg-surface rounded-md border p-3"
        >
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-body text-fg text-sm font-medium">{note.authorName}</span>
            <span className="text-fg-subtle font-mono text-xs">{formatInstant(note.at)}</span>
          </p>
          <p className="font-body text-fg-muted mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** An append-only note thread with a composer. */
export function NoteThread({ notes, onAdd, isAdding, readOnly }: NoteThreadProps) {
  const [draft, setDraft] = useState('');
  const [attempted, setAttempted] = useState(false);
  const tooShort = draft.trim().length < MIN_NOTE_LENGTH;

  const add = (): void => {
    setAttempted(true);
    if (tooShort) return;
    onAdd(draft.trim());
    setDraft('');
    setAttempted(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <NoteList notes={notes} />

      {!readOnly && (
        <Composer
          draft={draft}
          error={attempted && tooShort ? TOO_SHORT : null}
          isAdding={Boolean(isAdding)}
          onDraftChange={setDraft}
          onAdd={add}
        />
      )}
    </div>
  );
}

interface ComposerProps {
  readonly draft: string;
  readonly error: string | null;
  readonly isAdding: boolean;
  readonly onDraftChange: (draft: string) => void;
  readonly onAdd: () => void;
}

function Composer(props: ComposerProps) {
  return (
    <div className="flex flex-col gap-2">
      <FormField label="Add a note" hint={NOTE_HINT} error={props.error}>
        <Textarea
          rows={3}
          value={props.draft}
          disabled={props.isAdding}
          onChange={(event) => props.onDraftChange(event.target.value)}
        />
      </FormField>
      <div>
        <Button
          size="sm"
          loading={props.isAdding}
          onClick={props.onAdd}
          startIcon={<MessageSquarePlus className="size-4" />}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}
