'use client';

/**
 * Where and how a card may be used.
 *
 * Each switch is a separate channel because each fails separately: a customer who never shops
 * online should be able to turn that off without losing contactless, and a card declined for a
 * reason the customer set is a decline the app can explain.
 *
 * Every switch applies on save rather than on toggle, because the API replaces the control set
 * wholesale — sending a partial update would silently re-enable whatever was not included.
 */

import { useState } from 'react';

import type { CardControls } from '@reliance/contracts';
import { Button, Switch } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { AmountField, Section } from '@/components/transfers';

import type { useCardMutations } from './use-card-mutations';

/** The channels, each with a label that describes the state and a line saying what it covers. */
const CHANNELS = [
  { key: 'onlinePayments', label: 'Online payments', detail: 'Websites, apps and subscriptions' },
  { key: 'contactless', label: 'Contactless', detail: 'Tap to pay, up to the scheme limit' },
  { key: 'atmWithdrawals', label: 'Cash machines', detail: 'Withdrawals at any ATM' },
  { key: 'internationalPayments', label: 'Use abroad', detail: 'Payments outside the UK' },
  {
    key: 'magstripe',
    label: 'Magnetic stripe',
    detail: 'Older terminals that cannot read the chip',
  },
] as const satisfies readonly { key: keyof CardControls; label: string; detail: string }[];

/** Props for {@link ControlsForm}. */
export interface ControlsFormProps {
  readonly controls: CardControls;
  readonly currency: string;
  readonly mutation: ReturnType<typeof useCardMutations>['setControls'];
}

/**
 * @example <ControlsForm controls={card.controls} currency={card.currency} mutation={setControls} />
 */
export function ControlsForm({ controls, currency, mutation }: ControlsFormProps) {
  const [draft, setDraft] = useState<CardControls>(controls);
  const dailyLimit = draft.dailySpendLimit?.amount ?? '';

  const setLimit = (amount: string): void => {
    setDraft({
      ...draft,
      dailySpendLimit: amount
        ? { amount, currency: controls.dailySpendLimit?.currency ?? 'GBP' }
        : null,
    });
  };

  return (
    <Section
      title="Where this card works"
      description="Turn off anything you do not use. You can turn it back on at any time."
    >
      <div className="flex flex-col gap-5">
        <FormAlert error={mutation.error} />

        <ChannelSwitches
          controls={draft}
          onToggle={(key, on) => setDraft({ ...draft, [key]: on })}
        />

        <AmountField
          label="Daily spending limit"
          currency={currency as never}
          value={dailyLimit}
          onChange={setLimit}
          hint="Leave this empty to use the limit that comes with your account."
        />

        <div className="flex justify-end">
          <Button loading={mutation.isPending} onClick={() => mutation.mutate(draft)}>
            Save these controls
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Props for {@link ChannelSwitches}. */
interface ChannelSwitchesProps {
  readonly controls: CardControls;
  readonly onToggle: (key: keyof CardControls, on: boolean) => void;
}

/** One switch per channel, grouped so a screen reader announces what they belong to. */
function ChannelSwitches({ controls, onToggle }: ChannelSwitchesProps) {
  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0">
      <legend className="sr-only">Payment channels</legend>
      {CHANNELS.map((channel) => (
        <Switch
          key={channel.key}
          checked={Boolean(controls[channel.key])}
          description={channel.detail}
          onChange={(event) => onToggle(channel.key, event.target.checked)}
        >
          {channel.label}
        </Switch>
      ))}
    </fieldset>
  );
}
