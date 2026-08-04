'use client';

import { useEffect, type RefObject } from 'react';

const ESCAPE_KEY = 'Escape';

export interface MenuDismissOptions {
  /** The element the menu lives inside. A pointer press outside it dismisses. */
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly onDismiss: () => void;
}

/**
 * Dismisses an expanded menu on Escape, on a press outside it, or when focus leaves it.
 *
 * Deliberately **not** a focus trap. A mega-menu is a navigation aid, not a decision the
 * customer has to finish: trapping focus in one would mean a keyboard user who opened it
 * by mistake could not simply Tab past it to reach the page.
 */
export function useMenuDismiss({ containerRef, open, onDismiss }: MenuDismissOptions): void {
  useEffect(() => {
    if (!open) return undefined;

    const container = containerRef.current;

    const isInside = (target: EventTarget | null): boolean =>
      container !== null && target instanceof Node && container.contains(target);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ESCAPE_KEY) onDismiss();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) onDismiss();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isInside(event.target)) onDismiss();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [containerRef, open, onDismiss]);
}
