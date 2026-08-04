/**
 * The dialog that raises a manual posting.
 *
 * Opened from the dual-control queue and from the reconciliation workbench, where an
 * unmatched item on one side of the book is exactly the situation a manual adjustment
 * exists for. Both entry points raise the same request through the same validation.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ManualPostingRequest } from '@reliance/contracts';
import { Alert, Dialog } from '@reliance/ui';

import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';

import { DialogActions } from './dialog-actions';
import { PostingFields } from './manual-posting-fields';
import {
  draftErrors,
  emptyDraft,
  isDraftValid,
  toRequest,
  type PostingDraft,
} from './manual-posting-form';
import { opsKeys } from './query-keys';

export interface ManualPostingDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Pre-fills the form from the record the operator came from. */
  readonly defaults?: Partial<PostingDraft>;
  /** Called once the request is on the queue, so the caller can re-read it. */
  readonly onRaised?: () => void;
}

/** Raises a manual posting for a second operator to approve. */
/** The draft posting, cleared on each opening, and the request that raises it. */
function usePostingDraft(props: ManualPostingDialogProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PostingDraft>(() => emptyDraft(props.defaults));
  const [attempted, setAttempted] = useState(false);
  const [wasOpen, setWasOpen] = useState(props.open);

  // A dialog reopened against a different record must not inherit the last draft. Adjusted
  // during render for the same reason as `ReasonDialog`: an effect shows the stale draft
  // for a frame first.
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) {
      setDraft(emptyDraft(props.defaults));
      setAttempted(false);
    }
  }

  const raise = useMutation({
    mutationFn: async (request: ManualPostingRequest) =>
      (await client.admin.manualPosting(request)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('approvals') });
      props.onRaised?.();
      props.onClose();
    },
  });

  const submit = (): void => {
    setAttempted(true);
    if (!isDraftValid(draft)) return;
    raise.mutate(toRequest(draft));
  };

  return { draft, setDraft, attempted, raise, submit };
}

export function ManualPostingDialog(props: ManualPostingDialogProps) {
  const { draft, setDraft, attempted, raise, submit } = usePostingDraft(props);

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Raise a manual posting"
      size="lg"
      footer={
        <DialogActions
          confirmLabel="Send for approval"
          onCancel={props.onClose}
          onConfirm={submit}
          pending={raise.isPending}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {raise.error && <Alert tone="danger">{messageFor(raise.error)}</Alert>}
        <PostingFields
          draft={draft}
          onChange={setDraft}
          errors={draftErrors(draft)}
          showErrors={attempted}
          disabled={raise.isPending}
        />
      </div>
    </Dialog>
  );
}
