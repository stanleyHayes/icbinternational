'use client';

/**
 * Which screen of the send-money flow is on show.
 *
 * Separated from the flow's state so that the orchestrator reads as "here is the state, here is
 * what to do with it" rather than as a hundred lines of conditional markup. Exactly one branch
 * renders; the others are not mounted, so a hidden step cannot hold focus or be tabbed into.
 */

import { AmountStep } from './amount-step';
import { ConfirmationStep } from './confirmation-step';
import { DestinationStep } from './destination-step';
import { ReviewStep } from './review-step';
import type { FlowController } from './use-flow-controller';
import { FlowStep } from './use-transfer-flow';

/** Props for {@link FlowSteps}. */
export interface FlowStepsProps {
  readonly controller: FlowController;
}

function Destination({ controller }: FlowStepsProps) {
  const { flow } = controller;

  return (
    <DestinationStep
      draft={flow.destination}
      onChange={flow.patchDestination}
      onReplace={flow.replaceDestination}
      otherAccounts={flow.otherAccounts}
      errors={controller.errors}
      onContinue={controller.leaveDestination}
    />
  );
}

function Amount({ controller }: FlowStepsProps) {
  const { flow } = controller;

  return (
    <AmountStep
      value={flow.amount}
      onChange={flow.patchAmount}
      accounts={controller.accounts}
      source={flow.source}
      offerToSave={flow.offerToSave}
      crossCurrency={flow.crossCurrency}
      onBack={() => flow.goTo(FlowStep.DESTINATION)}
      onContinue={() => flow.goTo(FlowStep.REVIEW)}
    />
  );
}

function Review({ controller }: FlowStepsProps) {
  return (
    <ReviewStep
      payeeName={controller.payeeName}
      quoting={controller.quoting}
      sending={controller.sending}
      authorising={controller.authorising}
      failure={controller.failure}
      onBack={() => controller.flow.goTo(FlowStep.AMOUNT)}
      onSend={controller.send}
    />
  );
}

/**
 * @example <FlowSteps controller={controller} />
 */
export function FlowSteps({ controller }: FlowStepsProps) {
  if (controller.step === FlowStep.DESTINATION) return <Destination controller={controller} />;
  if (controller.step === FlowStep.AMOUNT) return <Amount controller={controller} />;
  if (controller.step === FlowStep.REVIEW) return <Review controller={controller} />;
  if (!controller.sent) return null;

  return <ConfirmationStep transfer={controller.sent} onRepeat={controller.repeat} />;
}
