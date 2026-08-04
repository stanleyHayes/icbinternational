'use client';

/**
 * The portal, scrim and focus trap shared by Dialog and Drawer.
 *
 * Rendered into `document.body` rather than in place, because a modal nested inside a card
 * inherits that card's `overflow: hidden` and stacking context, and then a confirmation dialog
 * gets clipped by the widget that opened it.
 */

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useDismissableLayer } from '../hooks/use-dismissable-layer.js';
import { cn } from '../lib/cn.js';

/** Where the panel sits, and therefore which edge it animates from. */
export type ModalPlacement = 'center' | 'left' | 'right' | 'bottom';

const ALIGNMENT: Readonly<Record<ModalPlacement, string>> = {
  center: 'items-center justify-center p-4',
  left: 'items-stretch justify-start',
  right: 'items-stretch justify-end',
  bottom: 'items-end justify-center',
};

const ENTRANCE: Readonly<Record<ModalPlacement, string>> = {
  center: 'animate-scale-in',
  left: 'animate-fade-in',
  right: 'animate-fade-in',
  bottom: 'animate-slide-up',
};

export interface ModalSurfaceProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly placement: ModalPlacement;
  /** `id` of the element naming the dialog. Every modal needs a name or a `label`. */
  readonly labelledBy?: string;
  readonly describedBy?: string;
  /** Accessible name, when there is no visible title to point at. */
  readonly label?: string;
  readonly panelClassName?: string;
  readonly children: ReactNode;
}

/**
 * Traps focus, closes on Escape and on scrim click, restores focus on unmount.
 *
 * Internal — use Dialog or Drawer.
 */
export function ModalSurface(props: ModalSurfaceProps) {
  const { open, onClose, placement, labelledBy, describedBy, label, panelClassName } = props;
  const panel = useRef<HTMLDivElement>(null);

  useDismissableLayer({ containerRef: panel, open, onDismiss: onClose });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex', ALIGNMENT[placement])}>
      {/* The scrim is a mouse convenience. Escape is the keyboard path and is bound on the
          document by useDismissableLayer, so the scrim never needs to be focusable or operable
          by key — making it a button would instead put a nameless control in the tab order. */}
      {}
      <div
        role="presentation"
        onClick={onClose}
        className="bg-overlay animate-fade-in absolute inset-0"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        // Focusable so the trap has somewhere to put focus when the panel holds no controls.
        tabIndex={-1}
        className={cn(
          'bg-surface text-fg relative z-10 flex max-h-full flex-col shadow-lg outline-none',
          ENTRANCE[placement],
          panelClassName,
        )}
      >
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
