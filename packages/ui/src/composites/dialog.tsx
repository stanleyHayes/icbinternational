'use client';

/**
 * The Dialog — a centred modal for a decision that must be made now.
 *
 * Reserved for confirmations and short flows: "Send £2,400 to James Mensah?" A dialog blocks the
 * page, so anything the user might need to check before answering has to be inside it.
 *
 * The title is rendered by the component rather than passed as children so it can be wired to
 * `aria-labelledby`. A modal without an accessible name is announced as "dialog" and nothing else.
 */

import { useId, type ReactNode } from 'react';

import { CloseIcon } from '../foundation/icons.js';
import { FOCUS_RING } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { ModalSurface } from './modal-surface.js';

export type DialogSize = 'sm' | 'md' | 'lg';

const SIZE: Readonly<Record<DialogSize, string>> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-lg',
  lg: 'w-full max-w-2xl',
};

const CLOSE_LABEL = 'Close dialog';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  /** Supporting line under the title, wired to `aria-describedby`. */
  readonly description?: ReactNode;
  readonly size?: DialogSize;
  /** Footer actions. The confirming action goes last, nearest the user's thumb. */
  readonly footer?: ReactNode;
  /** Hides the corner close button for a decision that must be answered, not dismissed. */
  readonly hideClose?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * @example
 * <Dialog open={open} onClose={close} title="Confirm transfer" footer={<Button>Send</Button>}>
 *   …
 * </Dialog>
 */
export function Dialog(props: DialogProps) {
  const { open, onClose, title, description, size = 'md', footer, hideClose, className } = props;
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = description ? `${baseId}-description` : undefined;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      placement="center"
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName={cn('rounded-lg', SIZE[size], className)}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-display text-xl font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-fg-muted text-sm">
              {description}
            </p>
          )}
        </div>
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={CLOSE_LABEL}
            className={cn('text-fg-muted hover:text-fg -mt-1 rounded-sm p-1', FOCUS_RING)}
          >
            <CloseIcon className="size-5" />
          </button>
        )}
      </div>
      <div className="font-body overflow-y-auto p-5 text-base">{props.children}</div>
      {footer && (
        <div className="border-border flex items-center justify-end gap-3 border-t p-5">
          {footer}
        </div>
      )}
    </ModalSurface>
  );
}
