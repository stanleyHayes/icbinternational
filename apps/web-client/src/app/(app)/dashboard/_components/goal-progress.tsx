'use client';

/**
 * How the customer's savings goals are going.
 *
 * The ring comes from the design system, which computes the arc from `bigint` minor units — so
 * £1,999.99 of £2,000 never rounds up to a finished goal. Its accessible name is a full sentence
 * with both amounts in it, because "83 percent" leaves out the two numbers that matter.
 *
 * A goal that has fallen behind its target date says so in words next to the ring, not by the
 * ring changing colour.
 */

import type { Goal } from '@reliance/contracts';
import { MoneyText, ProgressRing, cn, TEXT_STYLE } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { formatDate } from '@/lib/format';
import { appRoutes } from '@/lib/routes';

import { Panel } from './panel';
import { GOAL_LIMIT, useGoals } from './use-dashboard';

const ROW_HEIGHT = 96;
const BODY_HEIGHT = GOAL_LIMIT * ROW_HEIGHT;

/** "£1,660.00 of £2,000.00" — both figures, because a percentage on its own motivates nobody. */
function Progress({ goal }: { readonly goal: Goal }) {
  return (
    <p className="text-fg-muted flex flex-wrap items-center gap-1 text-sm">
      <MoneyText
        amount={goal.currentAmount.amount}
        currency={goal.currentAmount.currency}
        size="sm"
        muted
      />
      <span>of</span>
      <MoneyText
        amount={goal.targetAmount.amount}
        currency={goal.targetAmount.currency}
        size="sm"
        muted
      />
    </p>
  );
}

/** Whether the goal will reach its target date, said in words rather than in colour alone. */
function Pace({ goal }: { readonly goal: Goal }) {
  if (!goal.targetDate) return null;

  return (
    <p className={cn('text-sm', goal.onTrack ? 'text-fg-muted' : 'text-pending')}>
      {goal.onTrack
        ? `On track for ${formatDate(goal.targetDate)}`
        : `Behind schedule for ${formatDate(goal.targetDate)}`}
    </p>
  );
}

function GoalRow({ goal }: { readonly goal: Goal }) {
  return (
    <li className="border-border flex items-center gap-4 border-b py-3 last:border-0">
      <ProgressRing
        label={goal.name}
        saved={goal.currentAmount.amount}
        target={goal.targetAmount.amount}
        currency={goal.targetAmount.currency}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="text-fg truncate font-medium">
          {goal.emoji ? `${goal.emoji} ` : ''}
          {goal.name}
        </p>
        <Progress goal={goal} />
        <Pace goal={goal} />
      </div>
    </li>
  );
}

/** The customer's savings goals, closest to done first. */
export function GoalProgress() {
  const goals = useGoals();
  const shown = (goals.data ?? []).slice(0, GOAL_LIMIT);

  return (
    <Panel
      title="Your goals"
      description="What you are putting money aside for."
      minBodyHeight={BODY_HEIGHT}
      loading={goals.isPending}
      error={goals.isError ? goals.error : undefined}
      action={
        <LinkButton href={appRoutes.save} variant="ghost">
          Manage
        </LinkButton>
      }
    >
      {shown.length === 0 ? (
        <EmptyPanel
          bordered={false}
          title="No goals yet"
          description="Name something you are saving for, set an amount, and we will show you how close you are — and round up your card payments into it if you like."
          action={<LinkButton href={appRoutes.save}>Set a goal</LinkButton>}
        />
      ) : (
        <ul className={cn(TEXT_STYLE.body, 'flex flex-col')}>
          {shown.map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
