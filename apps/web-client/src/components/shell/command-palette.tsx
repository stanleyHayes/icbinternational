'use client';

/**
 * The command palette.
 *
 * A combobox over a listbox — the pattern assistive technology already knows. The input keeps
 * focus throughout, the arrow keys move the highlight, and `aria-activedescendant` names the
 * highlighted row without focus ever leaving the field. Moving DOM focus into the list instead,
 * which is the obvious implementation, silently breaks typing.
 *
 * The body is mounted only while the palette is open, which is what resets the query between
 * openings without any state-clearing effect.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { Dialog } from '@reliance/ui';

import { CommandBody } from './command-body';
import type { CommandItem } from './command-items';

/** Props for {@link CommandPalette}. */
export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly CommandItem[];
}

/** Mounted once by {@link CommandPaletteProvider}. */
export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const router = useRouter();

  const choose = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.href) router.push(item.href);
      else item.run?.();
    },
    [onClose, router],
  );

  return (
    <Dialog open={open} onClose={onClose} title="Search" size="lg" hideClose>
      {open ? <CommandBody items={items} onChoose={choose} /> : null}
    </Dialog>
  );
}
