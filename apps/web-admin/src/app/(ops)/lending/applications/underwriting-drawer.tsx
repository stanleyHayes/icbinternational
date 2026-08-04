/**
 * The underwriting workstation.
 *
 * One application, everything needed to decide it, in the order it is decided: what was
 * asked for, whether the applicant can afford it, what documents are outstanding, what
 * offer we would make, and then the decision itself. Assembled as one scrollable panel so
 * an underwriter never has to hold a figure in their head across a navigation.
 */

'use client';

import { useState } from 'react';

import { LoanApplicationStatus, type LoanApplication } from '@reliance/contracts';
import { Badge, EmptyState, MoneyText, StatusPill } from '@reliance/ui';

import { toneForApplication } from '@/components/ops';
import { DetailDrawer, DetailField, DetailSection } from '@/components/shell/ops';
import { formatBasisPoints, formatInstant, humaniseCode } from '@/lib/format';

import { AssessmentPanel } from './assessment-panel';
import { DecisionForm } from './decision-form';
import { OfferBuilder, type QuotedOffer } from './offer-builder';

/** Statuses on which no further underwriting decision is possible. */
const CLOSED: ReadonlySet<LoanApplicationStatus> = new Set([
  LoanApplicationStatus.DECLINED,
  LoanApplicationStatus.WITHDRAWN,
  LoanApplicationStatus.OFFER_EXPIRED,
  LoanApplicationStatus.DISBURSED,
]);

function RequestFields({ application }: Readonly<{ application: LoanApplication }>) {
  return (
    <DetailSection title="What was asked for">
      <DetailField label="Product">{application.productCode}</DetailField>
      <DetailField label="Amount">
        <MoneyText
          amount={application.requestedAmount.amount}
          currency={application.requestedAmount.currency}
          size="sm"
          muted
        />
      </DetailField>
      <DetailField label="Term">{application.termMonths} months</DetailField>
      <DetailField label="Purpose">{application.purpose}</DetailField>
      <DetailField label="Submitted">{formatInstant(application.submittedAt)}</DetailField>
      <DetailField label="Decided">{formatInstant(application.decidedAt)}</DetailField>
    </DetailSection>
  );
}

function DocumentFields({ application }: Readonly<{ application: LoanApplication }>) {
  return (
    <DetailSection title="Documents required">
      <DetailField label="Outstanding">
        {application.requiredDocumentKinds.length === 0 ? (
          'Nothing outstanding.'
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {application.requiredDocumentKinds.map((kind) => (
              <Badge key={kind} tone="pending">
                {humaniseCode(kind)}
              </Badge>
            ))}
          </span>
        )}
      </DetailField>
    </DetailSection>
  );
}

function ExistingOffer({ application }: Readonly<{ application: LoanApplication }>) {
  const { offer } = application;
  if (!offer) return null;

  return (
    <DetailSection title="Offer already made">
      <DetailField label="Amount">
        <MoneyText amount={offer.amount.amount} currency={offer.amount.currency} size="sm" muted />
      </DetailField>
      <DetailField label="Rate">{formatBasisPoints(offer.aprBps)} APR</DetailField>
      <DetailField label="Monthly payment">
        <MoneyText
          amount={offer.monthlyPayment.amount}
          currency={offer.monthlyPayment.currency}
          size="sm"
        />
      </DetailField>
      <DetailField label="Expires">{formatInstant(application.offerExpiresAt)}</DetailField>
    </DetailSection>
  );
}

export interface UnderwritingDrawerProps {
  readonly application: LoanApplication | null;
  readonly onClose: () => void;
}

/** Everything needed to underwrite one application. */
/** A drawer section whose content spans the full width rather than sitting in the label grid. */
function DrawerSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <DetailSection title={title}>
      <div className="col-span-2">{children}</div>
    </DetailSection>
  );
}

/**
 * Build an offer, then record a decision — in that order.
 *
 * Only rendered for an application still open to one. A closed application shows an empty
 * state instead, because a decision recorded against it would have nothing to act on.
 */
function UnderwritingActions({
  application,
  offer,
  onQuoted,
  onDecided,
}: {
  readonly application: LoanApplication;
  readonly offer: QuotedOffer | null;
  readonly onQuoted: (offer: QuotedOffer) => void;
  readonly onDecided: () => void;
}) {
  return (
    <>
      <DrawerSection title="Offer">
        <OfferBuilder application={application} onQuoted={onQuoted} />
      </DrawerSection>
      <DrawerSection title="Decision">
        <DecisionForm application={application} offer={offer} onDecided={onDecided} />
      </DrawerSection>
    </>
  );
}

/** Everything inside the drawer once an application is open. */
function DrawerBody({
  application,
  closed,
  offer,
  onQuoted,
  onDecided,
}: {
  readonly application: LoanApplication;
  readonly closed: boolean;
  readonly offer: QuotedOffer | null;
  readonly onQuoted: (offer: QuotedOffer) => void;
  readonly onDecided: () => void;
}) {
  return (
    <>
      <RequestFields application={application} />
      <DocumentFields application={application} />
      <ExistingOffer application={application} />

      <DrawerSection title="Affordability">
        <AssessmentPanel application={application} />
      </DrawerSection>

      {closed ? (
        <EmptyState
          title="This application is closed"
          description="No further underwriting decision can be recorded against it."
        />
      ) : (
        <UnderwritingActions
          application={application}
          offer={offer}
          onQuoted={onQuoted}
          onDecided={onDecided}
        />
      )}
    </>
  );
}

export function UnderwritingDrawer({ application, onClose }: UnderwritingDrawerProps) {
  const [offer, setOffer] = useState<QuotedOffer | null>(null);
  const closed = application ? CLOSED.has(application.status) : false;

  return (
    <DetailDrawer
      open={application !== null}
      onClose={onClose}
      title="Underwriting"
      subtitle={
        application ? (
          <StatusPill
            tone={toneForApplication(application.status)}
            label={humaniseCode(application.status)}
          />
        ) : undefined
      }
      recordId={application?.id}
    >
      {application && (
        <DrawerBody
          application={application}
          closed={closed}
          offer={offer}
          onQuoted={setOffer}
          onDecided={onClose}
        />
      )}
    </DetailDrawer>
  );
}
