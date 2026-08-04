/**
 * Saved views, as a plain select.
 *
 * A native `<select>` rather than a custom listbox: it is one keystroke to open, typeable
 * to jump, and correct on every assistive technology without any code of ours. An
 * operator switching between "my open cases" and "unassigned, oldest first" does it
 * dozens of times a day and should never have to look at the control to do it.
 */

'use client';

import { BookmarkPlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button, Select } from '@reliance/ui';

import type { SavedView } from '@/lib/saved-views';

/** Value of the "no saved view selected" option. */
const UNSAVED = '';

export interface ViewPickerProps {
  readonly views: readonly SavedView[];
  readonly activeViewId: string | null;
  readonly onApply: (view: SavedView) => void;
  readonly onSave: (name: string) => void;
  readonly onDelete: (id: string) => void;
}

/** The half-finished act of naming a view: open, typed into, then kept or abandoned. */
function useNaming(onSave: (name: string) => void) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  return {
    naming,
    name,
    setName,
    start: () => setNaming(true),
    cancel: () => setNaming(false),
    commit: () => {
      const trimmed = name.trim();
      if (trimmed.length > 0) onSave(trimmed);
      setName('');
      setNaming(false);
    },
  };
}

/** The saved-view control for a data table's toolbar. */
export function ViewPicker({ views, activeViewId, onApply, onSave, onDelete }: ViewPickerProps) {
  const naming = useNaming(onSave);

  const choose = (id: string): void => {
    const view = views.find((candidate) => candidate.id === id);
    if (view) onApply(view);
  };

  if (naming.naming) {
    return (
      <ViewNameField
        value={naming.name}
        onChange={naming.setName}
        onCommit={naming.commit}
        onCancel={naming.cancel}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        selectSize="sm"
        aria-label="Saved views"
        placeholder="Saved views"
        value={activeViewId ?? UNSAVED}
        onChange={(event) => choose(event.target.value)}
        options={views.map((view) => ({ value: view.id, label: view.name }))}
      />
      <ViewActions activeViewId={activeViewId} onStartNaming={naming.start} onDelete={onDelete} />
    </div>
  );
}

interface ViewActionsProps {
  readonly activeViewId: string | null;
  readonly onStartNaming: () => void;
  readonly onDelete: (id: string) => void;
}

/** Keep and discard, next to the picker. Discard appears only when there is one to lose. */
function ViewActions({ activeViewId, onStartNaming, onDelete }: ViewActionsProps) {
  return (
    <>
      <IconAction
        label="Save this arrangement as a view"
        onClick={onStartNaming}
        icon={<BookmarkPlus className="size-4" />}
      />
      {activeViewId && (
        <IconAction
          label="Delete this saved view"
          onClick={() => onDelete(activeViewId)}
          icon={<Trash2 className="size-4" />}
        />
      )}
    </>
  );
}

interface IconActionProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly icon: ReactNode;
}

/** A labelled icon button. The label is both the accessible name and the tooltip. */
function IconAction({ label, onClick, icon }: IconActionProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      onClick={onClick}
      aria-label={label}
      title={label}
      startIcon={icon}
    />
  );
}

interface ViewNameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}

function ViewNameField({ value, onChange, onCommit, onCancel }: ViewNameFieldProps) {
  const field = useRef<HTMLInputElement>(null);

  // The field has just replaced the control the operator clicked, so focus has to follow
  // it or they are left typing into nothing.
  useEffect(() => field.current?.focus(), []);

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onCommit();
      }}
    >
      <input
        ref={field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Name for this view"
        placeholder="Name this view"
        className="border-border bg-surface font-body h-8 rounded-md border px-2 text-sm"
      />
      <Button size="sm" type="submit">
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
