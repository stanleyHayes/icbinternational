/**
 * One account in collections.
 *
 * The panel puts the arrears next to the whole position — outstanding balance,
 * instalments paid and left, the rate — because a collections conversation that starts
 * from the missed payment alone leads to arrangements the customer cannot keep.
 *
 * Writing a loan off is the one irreversible action here, so it goes through dual control
 * like any other movement of value: the panel raises the posting, and a second operator
 * approves it.
 */

'use client';

import { useState } from 'react';

import { LoanStatus, Permission, type Loan } from '@reliance/contracts';
import { Alert, Button, MoneyText, StatusPill } from '@reliance/ui';

import { ManualPostingDialog, toneForLoan, type PostingDraft } from '@/components/ops';
import { DetailDrawer, DetailField, DetailSection } from '@/components/shell/ops';
import { formatBasisPoints, formatDate, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

/** General-ledger account impairment losses are charged to. */
const IMPAIRMENT_LEDGER_CODE = '7300';

const WRITE_OFF_NOTE =
  'A write-off removes the debt from the book and charges it to impairment. It does not ' +
  'release the customer from the debt, and it cannot be undone by editing — only by an ' +
  'opposing entry.';

function writeOffDraft(loan: Loan): Partial<PostingDraft> {
  return {
    amount: loan.outstandingBalance.amount.replace('-', ''),
    currency: loan.outstandingBalance.currency,
    contraLedgerCode: IMPAIRMENT_LEDGER_CODE,
    narrative: `Write-off of ${loan.productName}`,
    justification: `Loan ${loan.id} is ${loan.daysPastDue} days past due and recovery has been exhausted.`,
  };
}

function PositionFields({ loan }: Readonly<{ loan: Loan }>) {
  return (
    <DetailSection title="The position">
      <DetailField label="Product">{loan.productName}</DetailField>
      <DetailField label="Outstanding">
        <MoneyText
          amount={loan.outstandingBalance.amount}
          currency={loan.outstandingBalance.currency}
          size="sm"
          muted
        />
      </DetailField>
      <DetailField label="In arrears">
        <MoneyText
          amount={loan.arrearsAmount.amount}
          currency={loan.arrearsAmount.currency}
          size="sm"
        />
      </DetailField>
      <DetailField label="Days past due">{loan.daysPastDue}</DetailField>
      <DetailField label="Monthly payment">
        <MoneyText
          amount={loan.monthlyPayment.amount}
          currency={loan.monthlyPayment.currency}
          size="sm"
          muted
        />
      </DetailField>
      <DetailField label="Rate">{formatBasisPoints(loan.aprBps)} APR</DetailField>
      <DetailField label="Instalments paid">
        {loan.instalmentsPaid} of {loan.instalmentsPaid + loan.instalmentsRemaining}
      </DetailField>
      <DetailField label="Next payment">
        {loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : '—'}
      </DetailField>
      <DetailField label="Matures">{formatDate(loan.maturesOn)}</DetailField>
    </DetailSection>
  );
}

export interface CollectionsDrawerProps {
  readonly loan: Loan | null;
  readonly onClose: () => void;
}

/** The collections view of one loan, and the route to a write-off. */
/** Raising a write-off needs the posting permission; it is a manual posting like any other. */
function WriteOffAction({ onRaise }: { readonly onRaise: () => void }) {
  return (
    <Can permission={Permission.POSTING_INITIATE}>
      <Button variant="danger" onClick={onRaise}>
        Raise a write-off
      </Button>
    </Can>
  );
}

/**
 * What the operator needs to know before, or instead of, writing the loan off.
 *
 * A write-off is not reversible by reinstatement: the loan leaves the book and the balance
 * is charged to impairment, so a later recovery is posted as its own entry.
 */
function WriteOffNotice({ alreadyOff }: { readonly alreadyOff: boolean }) {
  if (alreadyOff) {
    return (
      <Alert tone="neutral" title="Already written off">
        This loan has been removed from the book and charged to impairment. Any recovery is posted
        as a new entry rather than by reinstating it.
      </Alert>
    );
  }

  return (
    <Alert tone="warning" title="Before raising a write-off">
      {WRITE_OFF_NOTE}
    </Alert>
  );
}

export function CollectionsDrawer({ loan, onClose }: CollectionsDrawerProps) {
  const [writingOff, setWritingOff] = useState(false);
  const alreadyOff = loan?.status === LoanStatus.WRITTEN_OFF;

  return (
    <DetailDrawer
      open={loan !== null}
      onClose={onClose}
      title="Collections"
      subtitle={
        loan ? (
          <StatusPill tone={toneForLoan(loan.status)} label={humaniseCode(loan.status)} />
        ) : undefined
      }
      recordId={loan?.id}
      footer={loan && !alreadyOff && <WriteOffAction onRaise={() => setWritingOff(true)} />}
    >
      {loan && <PositionFields loan={loan} />}

      <WriteOffNotice alreadyOff={alreadyOff} />

      {loan && (
        <ManualPostingDialog
          open={writingOff}
          onClose={() => setWritingOff(false)}
          defaults={writeOffDraft(loan)}
        />
      )}
    </DetailDrawer>
  );
}
