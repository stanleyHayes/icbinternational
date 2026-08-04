'use client';

/**
 * Ordering a card.
 *
 * Virtual and physical are presented as what they are rather than as a technical choice: one works
 * in a minute, the other arrives in the post and works in a shop. The delivery time is stated
 * before the customer chooses, because "where is my card?" three days later is a support call the
 * order screen could have prevented.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CardFormat, type IssueCardRequest } from '@reliance/contracts';
import { Button, FormField, Input, Radio, RadioGroup } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  laneRoutes,
  movementKeys,
  Section,
  useUsableAccounts,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';

const NICKNAME_MAX = 120;

const FORMATS = [
  {
    value: CardFormat.VIRTUAL,
    label: 'Virtual card',
    detail: 'Ready in seconds. Use it online and add it to your phone wallet.',
  },
  {
    value: CardFormat.PHYSICAL,
    label: 'Physical card',
    detail: 'Posted to your registered address, usually within five working days.',
  },
] as const;

/** Issues the card and takes the customer straight to it. */
function useIssueCard(
  cache: ReturnType<typeof useQueryClient>,
  router: ReturnType<typeof useRouter>,
) {
  return useMutation({
    mutationFn: async (body: IssueCardRequest) => (await browserApi().cards.issue(body)).data,
    onSuccess: async (card) => {
      await cache.invalidateQueries({ queryKey: movementKeys.cards.all });
      router.push(laneRoutes.cards.detail(card.id));
    },
  });
}

/**
 * @example <OrderCardForm />
 */
export function OrderCardForm() {
  const router = useRouter();
  const cache = useQueryClient();
  const accounts = useUsableAccounts();
  const [accountId, setAccountId] = useState('');
  const [format, setFormat] = useState<CardFormat>(CardFormat.VIRTUAL);
  const [nickname, setNickname] = useState('');

  const order = useIssueCard(cache, router);

  const submit = (): void => {
    if (!accountId) return;
    order.mutate({
      accountId,
      format,
      tier: 'STANDARD',
      deliveryAddressOverride: false,
      ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
    });
  };

  return (
    <Section title="Order a card" description="Choose which account it spends from.">
      <div className="flex flex-col gap-6">
        <FormAlert error={order.error} />

        <AccountSelect
          label="Card spends from"
          accounts={accounts.data ?? []}
          value={accountId}
          onChange={setAccountId}
          hideBalance
        />

        <FormatPicker value={format} onChange={setFormat} />
        <NicknameField value={nickname} onChange={setNickname} />

        <div className="flex justify-end">
          <Button disabled={!accountId} loading={order.isPending} onClick={submit}>
            Order this card
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Virtual or physical, described by what each actually means for the customer. */
function FormatPicker({
  value,
  onChange,
}: {
  readonly value: CardFormat;
  readonly onChange: (format: CardFormat) => void;
}) {
  return (
    <RadioGroup legend="What kind of card?" name="card-format">
      {FORMATS.map((option) => (
        <Radio
          key={option.value}
          name="card-format"
          value={option.value}
          checked={value === option.value}
          description={option.detail}
          className="border-border hover:bg-surface-sunken rounded-md border p-3"
          onChange={() => onChange(option.value)}
        >
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}

/** What the customer calls this card. Private, and useful once they hold more than one. */
function NicknameField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField label="Name this card" hint="Only you see this. It helps when you hold several.">
      <Input
        value={value}
        maxLength={NICKNAME_MAX}
        placeholder="Everyday, Subscriptions, Travel"
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}
