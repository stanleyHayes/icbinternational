/**
 * The columns of the screening queue.
 *
 * Sorted hardest-first by default. A list of hits ordered by arrival buries the 96%
 * sanctions match behind forty 68% name collisions, and the 96% is the one that stops the
 * bank taking on a customer it must not.
 *
 * The list name is a column of its own rather than being folded into the match type. "OFAC
 * SDN" and "domestic PEP register" are both `SANCTIONS`-adjacent to a machine and utterly
 * different to an analyst deciding how much evidence they need before discounting one.
 */

'use client';

import type { ScreeningHit } from '@reliance/api-client';
import { Badge, StatusPill } from '@reliance/ui';

import { MatchScore, scoreBandLabel, screeningTone } from '@/components/compliance/kit';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

/** Columns for the screening queue. */
export const SCREENING_COLUMNS: readonly DataColumn<ScreeningHit>[] = [
  {
    id: 'customer',
    header: 'Customer',
    alwaysVisible: true,
    cell: (hit) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">{hit.customerName}</span>
        <span className="text-fg-subtle font-mono text-xs">{hit.userId}</span>
      </span>
    ),
    csv: (hit) => hit.customerName,
  },
  {
    id: 'matched',
    header: 'Matched against',
    alwaysVisible: true,
    cell: (hit) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm">{hit.matchedName}</span>
        <span className="font-body text-fg-muted text-xs">{hit.listName}</span>
      </span>
    ),
    csv: (hit) => `${hit.matchedName} (${hit.listName})`,
  },
  {
    id: 'score',
    header: 'Confidence',
    cell: (hit) => <MatchScore score={hit.matchScore} />,
    csv: (hit) => `${hit.matchScore} — ${scoreBandLabel(hit.matchScore)}`,
    sortValue: (hit) => hit.matchScore,
  },
  {
    id: 'type',
    header: 'List type',
    cell: (hit) => <Badge>{humaniseCode(hit.matchType)}</Badge>,
    csv: (hit) => humaniseCode(hit.matchType),
  },
  {
    id: 'status',
    header: 'Adjudication',
    cell: (hit) => <StatusPill tone={screeningTone(hit.status)} label={humaniseCode(hit.status)} />,
    csv: (hit) => humaniseCode(hit.status),
  },
  {
    id: 'detail',
    header: 'Why it matched',
    cell: (hit) => <span className="font-body text-fg-muted text-xs">{hit.detail}</span>,
    csv: (hit) => hit.detail,
  },
  {
    id: 'screened',
    header: 'Screened',
    cell: (hit) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(hit.screenedAt)}</span>
    ),
    csv: (hit) => formatInstant(hit.screenedAt),
    sortValue: (hit) => hit.screenedAt,
  },
  {
    id: 'decided',
    header: 'Decided',
    cell: (hit) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(hit.decidedAt)}</span>
    ),
    csv: (hit) => formatInstant(hit.decidedAt),
  },
];
