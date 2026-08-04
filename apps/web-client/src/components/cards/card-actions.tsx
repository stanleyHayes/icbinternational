'use client';

/**
 * Freeze, activate and report — the three things a customer does in a hurry.
 *
 * Freezing is a switch, not a dialog, because it is reversible and because the moment somebody
 * needs it they are standing in a shop doorway. Reporting a card lost is final and orders a
 * replacement, so it is confirm-gated and says both of those things before it happens.
 */

import { useState } from 'react';

import { CardStatus, type Card } from '@reliance/contracts';
import { Button, Switch } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { ConfirmAction } from '@/components/transfers';

import { CLOSED } from './card-look';
import type { useCardMutations } from './use-card-mutations';

const REPORT_CONSEQUENCE =
  'This card will stop working immediately and cannot be turned back on. We will post you a replacement within five working days, and any subscriptions on the old card will need the new details.';

/** Props for {@link CardActions}. */
export interface CardActionsProps {
  readonly card: Card;
  readonly mutations: ReturnType<typeof useCardMutations>;
}

/**
 * @example <CardActions card={card} mutations={mutations} />
 */
export function CardActions({ card, mutations }: CardActionsProps) {
  const [reporting, setReporting] = useState(false);
  const frozen = card.status === CardStatus.FROZEN;
  const closed = CLOSED.has(card.status);

  return (
    <div className="flex flex-col gap-4">
      <FormAlert error={mutations.setFrozen.error ?? mutations.report.error} />

      {closed ? null : (
        <Switch
          checked={frozen}
          disabled={mutations.setFrozen.isPending}
          description="Freezing stops all spending straight away. Nothing is cancelled and you can unfreeze it whenever you like."
          onChange={(event) => mutations.setFrozen.mutate(event.target.checked)}
        >
          {frozen ? 'Card frozen' : 'Card active'}
        </Switch>
      )}

      {closed ? null : (
        <div>
          <Button variant="danger" onClick={() => setReporting(true)}>
            Report this card lost or stolen
          </Button>
        </div>
      )}

      <ConfirmAction
        open={reporting}
        onClose={() => setReporting(false)}
        title="Report this card lost or stolen"
        consequence={REPORT_CONSEQUENCE}
        confirmLabel="Report and replace"
        destructive
        stepUpReason="report your card lost"
        onConfirm={async () => {
          await mutations.report.mutateAsync({ reason: 'LOST', orderReplacement: true });
        }}
      />
    </div>
  );
}
