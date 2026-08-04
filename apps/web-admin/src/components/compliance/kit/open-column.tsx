/**
 * The control that opens a row into the workspace beneath the queue.
 *
 * Every queue in this lane has one, and they must behave identically: a real button, so
 * it is reachable with Tab and has a focus ring, and `aria-pressed` so a screen-reader
 * user can tell which row is currently open. Getting that wrong once per screen is how a
 * console becomes unusable without a mouse.
 *
 * It exports nothing to the CSV, because "there is a button here" is not data.
 */

'use client';

import { Button } from '@reliance/ui';

import type { DataColumn } from '@/components/shell/ops';

export interface OpenColumnOptions<T> {
  /** Column heading — "Review", "Triage", "Workspace". Says what opening does. */
  readonly header: string;
  readonly idOf: (row: T) => string;
  /** The row currently open, so it can be marked as pressed. */
  readonly openId: string | null;
  readonly onOpen: (id: string) => void;
}

/** A trailing column whose button opens the row. */
export function openColumn<T>(options: OpenColumnOptions<T>): DataColumn<T> {
  const { header, idOf, openId, onOpen } = options;

  return {
    id: 'open',
    header,
    alwaysVisible: true,
    align: 'end',
    cell: (row) => (
      <Button
        size="sm"
        variant={idOf(row) === openId ? 'primary' : 'secondary'}
        aria-pressed={idOf(row) === openId}
        onClick={() => onOpen(idOf(row))}
      >
        Open
      </Button>
    ),
    csv: () => '',
  };
}
