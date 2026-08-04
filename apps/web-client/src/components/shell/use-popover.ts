'use client';

/**
 * Open/close behaviour for a non-modal popover — a menu, an account switcher, a notification tray.
 *
 * Deliberately not the design system's `useDismissableLayer`: that traps focus and locks the page,
 * which is right for a payment confirmation and wrong for a menu. A menu you cannot Tab out of is
 * a menu that has taken the page hostage.
 *
 * What it does provide is the part that is always forgotten. Escape closes it *and* puts focus
 * back on the trigger, so the next Tab continues from where the customer was rather than from the
 * top of the document.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const ESCAPE = 'Escape';

/** What {@link usePopover} hands back. */
export interface Popover {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
  /** Attach to the control that opens the popover. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** Attach to the popover's outermost element. */
  readonly panelRef: RefObject<HTMLDivElement | null>;
}

/** Wires a trigger and a panel together. */
export function usePopover(): Popover {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((previous) => !previous), []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ESCAPE) return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, toggle, close, triggerRef, panelRef };
}
