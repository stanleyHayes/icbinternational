'use client';

/**
 * The Drawer — a modal panel anchored to an edge.
 *
 * Where a Dialog interrupts for a decision, a Drawer holds a *task*: transaction detail, filters,
 * a multi-step payee form. It is edge-anchored because those tasks keep their context — the list
 * behind stays visible, so the user can see what they are working on.
 *
 * On narrow screens the bottom placement is the right default: a right-hand drawer on a phone is
 * a full-screen page pretending to be something else.
 */

import { useId, type ReactNode } from 'react';

import { CloseIcon } from '../foundation/icons.js';
import { FOCUS_RING } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { ModalSurface } from './modal-surface.js';

/** The edge the drawer is anchored to. */
export type DrawerSide = 'left' | 'right' | 'bottom';

const PANEL: Readonly<Record<DrawerSide, string>> = {
  left: 'h-full w-full max-w-md rounded-r-lg',
  right: 'h-full w-full max-w-md rounded-l-lg',
  bottom: 'max-h-[85vh] w-full rounded-t-xl',
};

const CLOSE_LABEL = 'Close panel';

export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly side?: DrawerSide;
  /** Sticky footer for the task's primary action. */
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * @example
 * <Drawer open={open} onClose={close} title="Transaction detail" side="right">…</Drawer>
 */
export function Drawer(props: DrawerProps) {
  const { open, onClose, title, side = 'right', footer, className } = props;
  const baseId = useId();
  const titleId = `${baseId}-title`;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      placement={side}
      labelledBy={titleId}
      panelClassName={cn(PANEL[side], className)}
    >
      <div className="border-border flex items-center justify-between gap-4 border-b p-5">
        <h2 id={titleId} className="font-display text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={CLOSE_LABEL}
          className={cn('text-fg-muted hover:text-fg rounded-sm p-1', FOCUS_RING)}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
      <div className="font-body flex-1 overflow-y-auto p-5 text-base">{props.children}</div>
      {footer && <div className="border-border border-t p-5">{footer}</div>}
    </ModalSurface>
  );
}
