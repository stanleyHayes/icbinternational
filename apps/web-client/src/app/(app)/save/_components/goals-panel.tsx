'use client';

/**
 * The customer's savings goals.
 *
 * Goals come first on the Save screen because they are the thing people come back to look at. A
 * deposit is set and forgotten; a goal is checked.
 */

import { useQuery } from '@tanstack/react-query';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { GoalCard } from './goal-card';

const NEW_GOAL = <LinkButton href={laneRoutes.save.newGoal}>Start a goal</LinkButton>;

const NO_GOALS = (
  <EmptyPanel
    title="No goals yet"
    description="A goal is money set aside for something in particular. Name it, set a target, and we will show you how close you are."
    action={NEW_GOAL}
  />
);

/**
 * @example <GoalsPanel />
 */
export function GoalsPanel() {
  const goals = useQuery({
    queryKey: movementKeys.save.goals(),
    queryFn: async () => (await browserApi().save.listGoals()).data,
  });

  return (
    <Section
      title="Your goals"
      description="Money set aside for something in particular."
      action={NEW_GOAL}
    >
      <QueryPanel
        query={goals}
        skeletonRows={2}
        isEmpty={(list) => list.length === 0}
        empty={NO_GOALS}
      >
        {(list) => (
          <ul className="flex flex-col gap-3">
            {list.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
