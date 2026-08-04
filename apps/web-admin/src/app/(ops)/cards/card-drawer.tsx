/**
 * One card, and what can be done to it.
 *
 * The controls are worded by consequence rather than by verb: "freeze" says it is
 * reversible, "report lost or stolen" says a replacement is coming and the old card will
 * never work again. An operator on a call picks the right one from the label alone.
 */

'use client';

import { useState } from 'react';

import { CardStatus, Permission, type Card } from '@reliance/contracts';
import { Alert, Button, MoneyText, StatusPill } from '@reliance/ui';

import { ReasonDialog, toneForCard } from '@/components/ops';
import { DetailDrawer, DetailField, DetailSection } from '@/components/shell/ops';
import { messageFor } from '@/lib/errors';
import { formatInstant, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

import { useCardActions } from './use-card-actions';

const FROZEN_STATES: ReadonlySet<CardStatus> = new Set([CardStatus.FROZEN]);

const DEAD_STATES: ReadonlySet<CardStatus> = new Set([
  CardStatus.LOST,
  CardStatus.STOLEN,
  CardStatus.CANCELLED,
  CardStatus.EXPIRED,
]);

function LimitField({
  label,
  amount,
}: Readonly<{ label: string; amount: Card['controls']['dailySpendLimit'] }>) {
  return (
    <DetailField label={label}>
      {amount ? (
        <MoneyText amount={amount.amount} currency={amount.currency} size="sm" muted />
      ) : (
        'Product limit applies'
      )}
    </DetailField>
  );
}

function ControlFields({ card }: Readonly<{ card: Card }>) {
  const { controls } = card;
  const onOff = (enabled: boolean): string => (enabled ? 'On' : 'Off');

  return (
    <DetailSection title="Card controls">
      <DetailField label="Online payments">{onOff(controls.onlinePayments)}</DetailField>
      <DetailField label="Contactless">{onOff(controls.contactless)}</DetailField>
      <DetailField label="Cash machines">{onOff(controls.atmWithdrawals)}</DetailField>
      <DetailField label="International">{onOff(controls.internationalPayments)}</DetailField>
      <DetailField label="Magnetic stripe">{onOff(controls.magstripe)}</DetailField>
      <LimitField label="Per payment" amount={controls.perTransactionLimit} />
      <LimitField label="Daily spend" amount={controls.dailySpendLimit} />
      <LimitField label="Daily cash" amount={controls.dailyAtmLimit} />
      <DetailField label="Blocked categories">
        {controls.blockedMccs.length === 0 ? 'None' : controls.blockedMccs.join(', ')}
      </DetailField>
    </DetailSection>
  );
}

function IdentityFields({ card }: Readonly<{ card: Card }>) {
  return (
    <DetailSection title="The card">
      <DetailField label="Cardholder">{card.cardholderName}</DetailField>
      <DetailField label="Number" mono>
        •••• •••• •••• {card.last4}
      </DetailField>
      <DetailField label="Scheme">{humaniseCode(card.scheme)}</DetailField>
      <DetailField label="Format">{humaniseCode(card.format)}</DetailField>
      <DetailField label="Tier">{humaniseCode(card.tier)}</DetailField>
      <DetailField label="Account" mono>
        {card.accountId}
      </DetailField>
      <DetailField label="PIN set">{card.pinSet ? 'Yes' : 'Not yet'}</DetailField>
      <DetailField label="Ordered">{formatInstant(card.orderedAt)}</DetailField>
      <DetailField label="Activated">{formatInstant(card.activatedAt)}</DetailField>
      <DetailField label="Expires">{formatInstant(card.expiresAt)}</DetailField>
    </DetailSection>
  );
}

interface ActionsProps {
  readonly card: Card;
  readonly onReport: () => void;
  readonly actions: ReturnType<typeof useCardActions>;
}

function CardActions({ card, onReport, actions }: ActionsProps) {
  const frozen = FROZEN_STATES.has(card.status);
  const dead = DEAD_STATES.has(card.status);

  if (dead) {
    return (
      <Alert tone="neutral">
        This card is {humaniseCode(card.status).toLowerCase()} and can no longer be used. Issue a
        new card from the register if the customer needs one.
      </Alert>
    );
  }

  return (
    <Can permission={Permission.CARD_MANAGE}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          loading={actions.freeze.isPending || actions.unfreeze.isPending}
          onClick={() => (frozen ? actions.unfreeze.mutate(card) : actions.freeze.mutate(card))}
        >
          {frozen ? 'Unfreeze the card' : 'Freeze the card'}
        </Button>
        <Button variant="danger" onClick={onReport}>
          Report lost or stolen
        </Button>
      </div>
    </Can>
  );
}

export interface CardDrawerProps {
  readonly card: Card | null;
  readonly onClose: () => void;
}

/** The card record, its controls, and the lifecycle actions. */
/**
 * Reporting a card lost or stolen.
 *
 * Destructive and irreversible: the card stops authorising the moment this is confirmed,
 * and a replacement is posted. The reason is required because it is what the fraud team
 * reads when the case is reviewed.
 */
function ReportDialog({
  open,
  onClose,
  onReport,
  pending,
  error,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onReport: (detail: string) => void;
  readonly pending: boolean;
  readonly error: unknown;
}) {
  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title="Report this card lost or stolen"
      description="The card stops working immediately and a replacement is posted to the address on file. This cannot be undone."
      confirmLabel="Report and reissue"
      destructive
      onConfirm={onReport}
      isSubmitting={pending}
      error={error ? messageFor(error) : null}
    />
  );
}

export function CardDrawer({ card, onClose }: CardDrawerProps) {
  const actions = useCardActions();
  const [reporting, setReporting] = useState(false);

  const report = (detail: string): void => {
    if (!card) return;
    actions.report.mutate(
      { card, body: { reason: 'STOLEN', detail, orderReplacement: true } },
      { onSuccess: () => setReporting(false) },
    );
  };

  return (
    <DetailDrawer
      open={card !== null}
      onClose={onClose}
      title="Card"
      subtitle={
        card ? (
          <StatusPill tone={toneForCard(card.status)} label={humaniseCode(card.status)} />
        ) : undefined
      }
      recordId={card?.id}
      footer={
        card && <CardActions card={card} actions={actions} onReport={() => setReporting(true)} />
      }
    >
      {card && <IdentityFields card={card} />}
      {card && <ControlFields card={card} />}
      {actions.freeze.error && <Alert tone="danger">{messageFor(actions.freeze.error)}</Alert>}

      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        onReport={report}
        pending={actions.report.isPending}
        error={actions.report.error}
      />
    </DetailDrawer>
  );
}
