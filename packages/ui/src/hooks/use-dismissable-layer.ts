'use client';

/**
 * Modal layer behaviour: focus trapping, Escape to close, and scroll locking.
 *
 * Shared by Dialog and Drawer. These are the parts of a modal that are invisible when correct and
 * catastrophic when wrong — a keyboard user tabbing out of a payment confirmation into the page
 * behind it has been silently locked out of the decision they were asked to make.
 */

import { useEffect, useRef, type RefObject } from 'react';

/** Elements that can hold focus. `[tabindex="-1"]` is excluded: it is programmatic-only. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const ESCAPE = 'Escape';
const TAB = 'Tab';

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/** Wraps Tab and Shift+Tab around the layer's own focusable elements. */
function wrapFocus(container: HTMLElement, event: KeyboardEvent): void {
  const items = focusableWithin(container);
  const first = items.at(0);
  const last = items.at(-1);

  if (!first || !last) {
    event.preventDefault();
    container.focus();
    return;
  }

  const leavingBackwards = event.shiftKey && document.activeElement === first;
  const leavingForwards = !event.shiftKey && document.activeElement === last;

  if (leavingBackwards) {
    event.preventDefault();
    last.focus();
  } else if (leavingForwards) {
    event.preventDefault();
    first.focus();
  }
}

export interface DismissableLayerOptions {
  /** The layer's outermost element. Must be focusable (`tabIndex={-1}`). */
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly onDismiss: () => void;
}

/**
 * Traps focus inside the layer while it is open, closes it on Escape, and restores focus to
 * whatever opened it. Restoring focus is not a nicety: without it the next Tab starts from the
 * top of the document, which for a screen-reader user means re-reading the entire page.
 */
export function useDismissableLayer({
  containerRef,
  open,
  onDismiss,
}: DismissableLayerOptions): void {
  // The listeners below are registered once per open/close, but `onDismiss` is usually an
  // inline arrow that changes every render. Reading it through a ref keeps the listeners
  // stable without capturing a stale closure. The ref is written in an effect, never during
  // render — a render-phase write is a tearing hazard under concurrent rendering, which is
  // what the compiler rule is protecting against.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    (focusableWithin(container).at(0) ?? container).focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === ESCAPE) {
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key === TAB) wrapFocus(container, event);
    };

    document.addEventListener('keydown', onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [containerRef, open]);
}
