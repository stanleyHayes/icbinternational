/**
 * Choosing which columns a table shows.
 *
 * A dialog rather than a hover menu on purpose. Operators configure a queue once and
 * then live in it for months, so the interaction being two clicks instead of one costs
 * nothing — and a checkbox list in a dialog is navigable by keyboard and readable by a
 * screen reader without a line of custom focus code.
 */

'use client';

import { Button, Checkbox, Dialog } from '@reliance/ui';

/** A column the operator may switch off. */
export interface ToggleableColumn {
  readonly id: string;
  readonly header: string;
  /** Identity columns stay: a row nobody can identify is not a row anybody can act on. */
  readonly alwaysVisible?: boolean;
}

export interface ColumnDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly columns: readonly ToggleableColumn[];
  readonly isVisible: (columnId: string) => boolean;
  readonly onToggle: (columnId: string) => void;
  readonly onShowAll: () => void;
}

/** The column-visibility dialog. */
export function ColumnDialog(props: ColumnDialogProps) {
  const { open, onClose, columns, isVisible, onToggle, onShowAll } = props;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Columns"
      description="Hide the columns this queue does not need. Your choice is remembered."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onShowAll}>
            Show all
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {columns.map((column) => (
          <li key={column.id}>
            <Checkbox
              checked={column.alwaysVisible ? true : isVisible(column.id)}
              disabled={column.alwaysVisible}
              onChange={() => onToggle(column.id)}
            >
              {column.header}
            </Checkbox>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
