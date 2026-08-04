'use client';

/**
 * The people a bill is being split between.
 *
 * Each row is a name and a number of shares. Shares rather than amounts because that is how people
 * describe an uneven split — "Sam had two courses" is two shares, not £34.50 — and because the API
 * then does the division in minor units, where the odd penny has somewhere to land.
 *
 * Every field is labelled with its row number. A column of unlabelled boxes is unusable with a
 * screen reader, and this is a form where getting the wrong row costs somebody money.
 */

import { Plus, Trash2 } from 'lucide-react';

import { Button, Input } from '@reliance/ui';

const MAX_PARTICIPANTS = 20;

/** One person the bill is split with. */
export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly shares: string;
}

/** A fresh, empty row. */
export function blankParticipant(): Participant {
  return { id: globalThis.crypto.randomUUID(), name: '', shares: '1' };
}

/** Props for {@link ParticipantRows}. */
export interface ParticipantRowsProps {
  readonly people: readonly Participant[];
  readonly onChange: (people: Participant[]) => void;
}

/** One row: who, and how many shares. */
function Row({
  person,
  index,
  onPatch,
  onRemove,
}: {
  readonly person: Participant;
  readonly index: number;
  readonly onPatch: (patch: Partial<Participant>) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Input
          aria-label={`Name of person ${index + 1}`}
          placeholder="Their name"
          value={person.name}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </div>
      <div className="w-20">
        <Input
          aria-label={`Shares for person ${index + 1}`}
          inputMode="numeric"
          value={person.shares}
          onChange={(event) => onPatch({ shares: event.target.value })}
        />
      </div>
      <Button
        variant="ghost"
        iconOnly
        aria-label={`Remove person ${index + 1}`}
        onClick={onRemove}
        startIcon={<Trash2 aria-hidden="true" className="size-4" />}
      />
    </li>
  );
}

/**
 * @example <ParticipantRows people={people} onChange={setPeople} />
 */
export function ParticipantRows({ people, onChange }: ParticipantRowsProps) {
  const patch = (id: string, change: Partial<Participant>): void =>
    onChange(people.map((person) => (person.id === id ? { ...person, ...change } : person)));

  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0">
      <legend className="text-fg text-sm font-medium">
        Who is splitting it, and how many shares each
      </legend>

      <ul className="flex flex-col gap-2">
        {people.map((person, index) => (
          <Row
            key={person.id}
            person={person}
            index={index}
            onPatch={(change) => patch(person.id, change)}
            onRemove={() => onChange(people.filter((candidate) => candidate.id !== person.id))}
          />
        ))}
      </ul>

      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={people.length >= MAX_PARTICIPANTS}
          onClick={() => onChange([...people, blankParticipant()])}
          startIcon={<Plus aria-hidden="true" className="size-4" />}
        >
          Add someone
        </Button>
      </div>
    </fieldset>
  );
}
