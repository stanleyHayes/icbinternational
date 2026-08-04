/**
 * A page's revision history, and the way back.
 *
 * Built on the audit chain rather than on a separate revisions store, which is not a
 * shortcut: the audit trail already records every field that changed, who changed it and
 * what it was before, and it is hash-linked so a history that has been tampered with says
 * so. A second store would be a second version of the truth.
 *
 * Restoring re-applies the "before" values as a new edit. The history is never rewritten —
 * a rollback is another entry in it, the same way a reversal is another entry in the
 * ledger.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AuditEvent, CmsPage } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import { QueryState, opsKeys } from '@/components/ops';
import { AuditTrail, brokenLinks } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatInstant } from '@/lib/format';

/** Audit entity name the platform records CMS pages under. */
const ENTITY = 'CmsPage';

/** Revisions read per page. */
const PAGE_SIZE = 50;

/** The fields a rollback is allowed to restore. Anything else is not page content. */
const RESTORABLE = new Set(['title', 'slug', 'status']);

/** The page as it was before this change, for the fields a rollback can put back. */
function restorePatch(event: AuditEvent): Partial<CmsPage> {
  const patch: Record<string, string> = {};
  for (const change of event.changes) {
    if (RESTORABLE.has(change.field) && change.before !== null) patch[change.field] = change.before;
  }
  return patch as Partial<CmsPage>;
}

interface RestoreRowProps {
  readonly event: AuditEvent;
  readonly onRestore: (event: AuditEvent) => void;
  readonly isRestoring: boolean;
  readonly broken: boolean;
}

function RestoreRow({ event, onRestore, isRestoring, broken }: RestoreRowProps) {
  const fields = event.changes.filter((change) => RESTORABLE.has(change.field));
  if (fields.length === 0) return null;

  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 last:border-0">
      <span className="flex min-w-0 flex-col">
        <span className="font-body text-fg text-sm">
          {fields.map((change) => change.field).join(', ')} changed by {event.actorName}
        </span>
        <span className="text-fg-muted font-mono text-xs">{formatInstant(event.at)}</span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={broken || isRestoring}
        onClick={() => onRestore(event)}
      >
        Restore what it was
      </Button>
    </li>
  );
}

export interface RevisionHistoryProps {
  readonly page: CmsPage;
}

/**
 * The audit trail for one page, and the restore that rewinds to a point in it.
 *
 * A restore invalidates both the content and the audit query: it changes the page *and*
 * appends to its own history, so leaving either cached shows a trail missing its latest
 * entry.
 */
function useRevisions(page: CmsPage) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const filters = { entity: ENTITY, entityId: page.id };

  const query = useQuery({
    queryKey: opsKeys.audit(filters),
    queryFn: async ({ signal }) => client.admin.audit({ ...filters, limit: PAGE_SIZE }, { signal }),
  });

  const restore = useMutation({
    mutationFn: async (event: AuditEvent) =>
      client.admin.updateCmsPage(page.id, restorePatch(event)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('content') });
      queryClient.invalidateQueries({ queryKey: opsKeys.audit(filters) });
    },
  });

  return { query, restore, events: query.data?.data ?? [] };
}

/** Every recorded change to this page, with a way back to any of them. */
export function RevisionHistory({ page }: RevisionHistoryProps) {
  const { query, restore, events } = useRevisions(page);
  const broken = brokenLinks(events);

  return (
    <div className="flex flex-col gap-3">
      {restore.error && <Alert tone="danger">{messageFor(restore.error)}</Alert>}

      <QueryState query={query} subject="this page's history">
        <div className="flex flex-col gap-3">
          <ul className="border-border flex flex-col rounded-md border">
            {events.map((event) => (
              <RestoreRow
                key={event.id}
                event={event}
                onRestore={(target) => restore.mutate(target)}
                isRestoring={restore.isPending}
                broken={broken.has(event.sequence)}
              />
            ))}
          </ul>

          <AuditTrail events={events} subject="this page" />
        </div>
      </QueryState>
    </div>
  );
}
