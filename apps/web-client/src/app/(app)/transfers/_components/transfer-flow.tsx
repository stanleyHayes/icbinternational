'use client';

/**
 * The unified send-money flow.
 *
 * One journey for all four rails, because from the customer's side they are one thing: say who,
 * say how much, look at what it costs, confirm. The rail is a consequence of the destination, not
 * a question to answer up front.
 *
 * A `<Stepper>` above it so the customer always knows how many screens are left. Nothing here
 * navigates, so it is a wizard rather than a set of routes; the browser's back button is left to
 * mean "leave the flow", which is what customers expect of a form they are part-way through.
 */

import type { Beneficiary } from '@reliance/contracts';
import { Stepper, type Step } from '@reliance/ui';

import { useUsableAccounts } from '@/components/transfers';

import { FlowSteps } from './flow-steps';
import { useFlowController } from './use-flow-controller';
import { FlowStep } from './use-transfer-flow';

const STEPS: readonly Step[] = [
  { id: FlowStep.DESTINATION, label: 'Who', description: 'Who you are paying' },
  { id: FlowStep.AMOUNT, label: 'How much', description: 'Amount and reference' },
  { id: FlowStep.REVIEW, label: 'Review', description: 'Cost and arrival' },
  { id: FlowStep.DONE, label: 'Done', description: 'Your receipt' },
];

const STEP_ORDER: readonly FlowStep[] = [
  FlowStep.DESTINATION,
  FlowStep.AMOUNT,
  FlowStep.REVIEW,
  FlowStep.DONE,
];

/** Props for {@link TransferFlowScreen}. */
export interface TransferFlowScreenProps {
  /** A payee to start from, resolved from `?payee=` by the page. */
  readonly initialPayee?: Beneficiary;
}

/**
 * @example <TransferFlowScreen initialPayee={payee} />
 */
export function TransferFlowScreen({ initialPayee }: TransferFlowScreenProps) {
  const accounts = useUsableAccounts();
  const controller = useFlowController(accounts.data, initialPayee);

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        label="Sending a payment"
        steps={STEPS}
        currentIndex={STEP_ORDER.indexOf(controller.step)}
      />
      <FlowSteps controller={controller} />
    </div>
  );
}
