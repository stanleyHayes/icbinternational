/**
 * Where the work is.
 *
 * Each row is a link, because the only useful response to a queue depth is to go and
 * work it. A count the platform would not total is shown with a `+` rather than rounded
 * or hidden: an operator who is told "50" and finds 900 stops believing the screen.
 */

'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Badge, cn, FOCUS_RING } from '@reliance/ui';

import { Panel } from '@/components/ops';
import { formatCount } from '@/lib/format';
import { href } from '@/lib/routes';

import { useQueueDepths, type QueueDepth } from './use-queue-depths';

const ROW =
  'flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left ' +
  'hover:bg-surface-sunken';

function depthLabel(queue: QueueDepth): string {
  if (queue.count === null) return '—';
  return queue.isFloor ? `${formatCount(queue.count)}+` : formatCount(queue.count);
}

function QueueRow({ queue }: Readonly<{ queue: QueueDepth }>) {
  const waiting = (queue.count ?? 0) > 0;

  return (
    <li>
      <Link href={href(queue.path)} className={cn(ROW, FOCUS_RING)}>
        <span className="flex min-w-0 flex-col">
          <span className="font-body text-fg text-sm font-medium">{queue.label}</span>
          <span className="font-body text-fg-muted text-xs">{queue.description}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={waiting ? 'pending' : 'neutral'} size="md">
            {depthLabel(queue)}
          </Badge>
          <ArrowRight aria-hidden="true" className="text-fg-subtle size-4" />
        </span>
      </Link>
    </li>
  );
}

/** The depth of every queue this operator is allowed to work. */
export function QueueDepths() {
  const queues = useQueueDepths();

  if (queues.length === 0) return null;

  return (
    <Panel
      title="Queues"
      description="Work waiting on a person, and how much of it there is."
      flush
    >
      <ul className="flex flex-col px-2 pb-2">
        {queues.map((queue) => (
          <QueueRow key={queue.id} queue={queue} />
        ))}
      </ul>
    </Panel>
  );
}
