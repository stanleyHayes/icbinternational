/**
 * Draft, review, publish — and when.
 *
 * The three states are not decoration. A page in review is one somebody has asked a
 * colleague to read; a scheduled page is one that will go live without anyone present.
 * The control therefore names what each transition commits the bank to, and scheduling
 * asks for a date rather than assuming "now", because the commonest reason to schedule is
 * a rate change that must not appear a day early.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PublishStatus, type CmsPage } from '@reliance/contracts';
import { Alert, Button, FormField, Input, StatusPill } from '@reliance/ui';

import { opsKeys, toneForPublish } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatInstant, humaniseCode } from '@/lib/format';

/** Midday UTC, so a scheduled page goes live inside the working day wherever it is read. */
const PUBLISH_TIME = 'T12:00:00Z';

const NEXT_LABEL: Partial<Record<PublishStatus, string>> = {
  [PublishStatus.DRAFT]: 'Send for review',
  [PublishStatus.IN_REVIEW]: 'Publish',
  [PublishStatus.SCHEDULED]: 'Publish now instead',
  [PublishStatus.PUBLISHED]: 'Republish',
  [PublishStatus.ARCHIVED]: 'Restore to draft',
};

const NEXT_STATUS: Readonly<Record<PublishStatus, PublishStatus>> = {
  [PublishStatus.DRAFT]: PublishStatus.IN_REVIEW,
  [PublishStatus.IN_REVIEW]: PublishStatus.PUBLISHED,
  [PublishStatus.SCHEDULED]: PublishStatus.PUBLISHED,
  [PublishStatus.PUBLISHED]: PublishStatus.PUBLISHED,
  [PublishStatus.ARCHIVED]: PublishStatus.DRAFT,
};

export interface PublishControlsProps {
  readonly page: CmsPage;
}

/**
 * Advancing through review and publishing, which are different acts.
 *
 * Advancing moves a page along the editorial workflow; publishing puts it in front of
 * customers. Both invalidate the same cache because either can change what the list shows.
 */
function usePublishing(page: CmsPage, scheduledFor: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const refresh = (): void => {
    queryClient.invalidateQueries({ queryKey: opsKeys.all('content') });
  };

  const advance = useMutation({
    mutationFn: async () =>
      client.admin.updateCmsPage(page.id, { status: NEXT_STATUS[page.status] }),
    onSuccess: refresh,
  });

  const publish = useMutation({
    mutationFn: async () =>
      client.admin.publish(page.id, {
        ...(scheduledFor ? { publishAt: `${scheduledFor}${PUBLISH_TIME}` } : {}),
      }),
    onSuccess: refresh,
  });

  return { advance, publish, error: advance.error ?? publish.error };
}

/** Where the page stands, and since when if it is live. */
function PublishStatusRow({ page }: { readonly page: CmsPage }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={toneForPublish(page.status)} label={humaniseCode(page.status)} />
      {page.publishedAt && (
        <span className="font-body text-fg-muted text-xs">
          Live since {formatInstant(page.publishedAt)}
        </span>
      )}
    </div>
  );
}

/** Moves a page through review and out to the website. */
export function PublishControls({ page }: PublishControlsProps) {
  const [scheduledFor, setScheduledFor] = useState('');
  const { advance, publish, error } = usePublishing(page, scheduledFor);

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="danger">{messageFor(error)}</Alert>}
      <PublishStatusRow page={page} />

      <div className="flex flex-wrap items-end gap-3">
        <FormField
          label="Go live on"
          hint="Leave empty to publish as soon as you press the button."
        >
          <Input
            type="date"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
          />
        </FormField>

        <Button variant="secondary" loading={advance.isPending} onClick={() => advance.mutate()}>
          {NEXT_LABEL[page.status] ?? 'Advance'}
        </Button>

        <Button loading={publish.isPending} onClick={() => publish.mutate()}>
          {scheduledFor ? 'Schedule it' : 'Publish now'}
        </Button>
      </div>
    </div>
  );
}
