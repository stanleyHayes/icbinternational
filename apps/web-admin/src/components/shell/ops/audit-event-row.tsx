/**
 * One line of the audit trail.
 *
 * Says who, what, when, and — the part most consoles omit — exactly which fields moved
 * from what to what. "Customer updated" is not an audit record; "risk rating: LOW → HIGH"
 * is. The before value is struck through rather than only coloured, so the direction of
 * the change survives a greyscale print and a colour-blind reader.
 */

'use client';

import { ShieldAlert } from 'lucide-react';

import type { AuditEvent } from '@reliance/contracts';
import { Badge, cn } from '@reliance/ui';

import { formatInstant, humaniseCode, shortenId } from '@/lib/format';

const NOT_SET = 'not set';

function ChangeList({ changes }: Readonly<Pick<AuditEvent, 'changes'>>) {
  if (changes.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {changes.map((change) => (
        <li key={change.field} className="text-fg-muted font-mono text-xs">
          <span className="text-fg">{change.field}</span>{' '}
          <span className="line-through">{change.before ?? NOT_SET}</span>{' '}
          <span aria-hidden="true">→</span>{' '}
          <span className="text-fg">{change.after ?? NOT_SET}</span>
        </li>
      ))}
    </ul>
  );
}

export interface AuditEventRowProps {
  readonly event: AuditEvent;
  /** True when this event's link to the one before it does not verify. */
  readonly broken: boolean;
}

/** A single audit event. */
export function AuditEventRow({ event, broken }: AuditEventRowProps) {
  return (
    <li
      className={cn(
        'border-border flex gap-3 border-b px-3 py-2 last:border-0',
        broken && 'bg-danger-soft',
      )}
    >
      <span className="text-fg-muted w-40 shrink-0 font-mono text-xs">
        {formatInstant(event.at)}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-body flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg font-medium">{event.actorName}</span>
          <Badge tone="neutral">{humaniseCode(event.actorType)}</Badge>
          <span className="text-fg-muted">{humaniseCode(event.action)}</span>
          <span className="text-fg-muted">
            {event.entity} <span className="font-mono text-xs">{shortenId(event.entityId)}</span>
          </span>
          {broken && (
            <span className="text-danger flex items-center gap-1 font-medium">
              <ShieldAlert aria-hidden="true" className="size-4" />
              Chain broken at this event
            </span>
          )}
        </span>
        <ChangeList changes={event.changes} />
      </span>

      <span className="text-fg-muted hidden w-44 shrink-0 flex-col text-right font-mono text-xs xl:flex">
        <span>{event.ipAddress ?? 'no address recorded'}</span>
        <span title={event.traceId}>{shortenId(event.traceId)}</span>
      </span>
    </li>
  );
}
