'use client';

/**
 * One savings goal.
 *
 * The ring carries the progress and the amounts carry the meaning: "£1,660 of £2,000" is what
 * motivates somebody, and a percentage on its own is not. Whether the goal is on track for its
 * date is stated in words, because a goal that will miss its date is worth knowing about while
 * there is still time to change something.
 */

import Link from 'next/link';

import type { Goal } from '@reliance/contracts';
import { cn, ProgressRing, StatusPill } from '@reliance/ui';

import { laneRoutes, MoneyCell } from '@/components/transfers';
import { formatDate } from '@/lib/format';

/** Props for {@link GoalCard}. */
export interface GoalCardProps {
  readonly goal: Goal;
}

/** What the goal's date means right now. */
function trackLine(goal: Goal): string {
  if (goal.completedAt) return 'You have reached this goal';
  if (!goal.targetDate) return 'No date set';
  return goal.onTrack
    ? `On track for ${formatDate(goal.targetDate)}`
    : `Behind for ${formatDate(goal.targetDate)}`;
}

/**
 * @example <GoalCard goal={goal} />
 */
export function GoalCard({ goal }: GoalCardProps) {
  return (
    <li>
      <Link
        href={laneRoutes.save.goal(goal.id)}
        className={cn(
          'border-border hover:bg-surface-sunken flex items-center gap-4 rounded-lg border p-4',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <ProgressRing
          size="sm"
          label={goal.name}
          saved={goal.currentAmount.amount}
          target={goal.targetAmount.amount}
          currency={goal.targetAmount.currency}
        />

        <GoalSummary goal={goal} />

        {goal.roundUpsEnabled ? <StatusPill tone="accent" label="Round-ups on" /> : null}
      </Link>
    </li>
  );
}

/** The goal's name and the two amounts that make it mean something. */
function GoalSummary({ goal }: GoalCardProps) {
  return (
    <span className="min-w-0 flex-1">
      <span className="text-fg flex items-center gap-2 text-sm font-medium">
        {goal.emoji ? <span aria-hidden="true">{goal.emoji}</span> : null}
        <span className="truncate">{goal.name}</span>
      </span>
      <span className="text-fg-muted mt-1 block text-sm">
        <MoneyCell money={goal.currentAmount} muted srLabel="Saved so far" /> of{' '}
        <MoneyCell money={goal.targetAmount} muted srLabel="Target" />
      </span>
      <span className="text-fg-subtle mt-1 block text-xs">{trackLine(goal)}</span>
    </span>
  );
}
