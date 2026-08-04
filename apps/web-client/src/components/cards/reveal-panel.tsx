'use client';

/**
 * The card number, on screen for thirty seconds.
 *
 * Grouped in fours, in a monospaced face, with a control to copy each part — because the reason
 * somebody reveals a card number is to type it somewhere else, and a number they have to
 * transcribe by eye is a number they get wrong.
 *
 * The countdown is stated, and the disappearance is announced. A screen reader user must not have
 * the number vanish silently mid-dictation.
 *
 * The visible countdown is `aria-hidden`, and the announcements come from a live region that is
 * mounted for the life of the panel. Both details matter. A live region whose text changes every
 * second queues thirty announcements over the digits somebody is reading out, and a live region
 * that is created at the same moment as its message is frequently not announced at all — which is
 * exactly what would happen to the one announcement that counts, the details going away.
 */

import { Eye, EyeOff } from 'lucide-react';

import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { CopyButton, DetailList, Section, type Detail } from '@/components/transfers';

import { useCardReveal, REVEAL_SECONDS } from './use-card-reveal';

const PAN_GROUP = /(.{4})(?=.)/g;

/** The one point in the countdown worth interrupting for. Every tick would be unusable. */
const WARN_AT_SECONDS = 10;

/** Props for {@link RevealPanel}. */
export interface RevealPanelProps {
  readonly cardId: string;
}

/** A copyable value in a monospaced face. */
function Secret({ value, subject }: { readonly value: string; readonly subject: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono tracking-wider select-all">{value}</span>
      <CopyButton value={value} subject={subject} />
    </span>
  );
}

function secretRows(details: NonNullable<ReturnType<typeof useCardReveal>['details']>): Detail[] {
  return [
    {
      id: 'pan',
      label: 'Card number',
      value: <Secret value={details.pan.replaceAll(PAN_GROUP, '$1 ')} subject="card number" />,
    },
    {
      id: 'expiry',
      label: 'Expires',
      value: <Secret value={details.expiry} subject="expiry date" />,
    },
    {
      id: 'cvv',
      label: 'Security code',
      value: <Secret value={details.cvv} subject="security code" />,
    },
    { id: 'holder', label: 'Name on the card', value: details.cardholderName },
  ];
}

/**
 * What the live region says, derived during render.
 *
 * Exactly three sentences exist, so the region's text only changes three times: when the details
 * appear, when they are about to go, and when they have gone. Every tick in between produces the
 * identical string, React writes nothing to the DOM, and the screen reader stays quiet — which is
 * the whole point, because the customer is reading a card number out loud while this runs.
 */
function announcementFor(revealed: boolean, hasRevealed: boolean, secondsLeft: number): string {
  if (!revealed) return hasRevealed ? 'Your card details are hidden again.' : '';
  if (secondsLeft <= WARN_AT_SECONDS) {
    return `${WARN_AT_SECONDS} seconds until your card details are hidden.`;
  }
  return `Your card details are on screen for ${REVEAL_SECONDS} seconds.`;
}

/** The details themselves, the visual countdown, and the way to end it early. */
function RevealedDetails({ reveal }: { readonly reveal: ReturnType<typeof useCardReveal> }) {
  if (!reveal.details) return null;

  return (
    <>
      <DetailList items={secretRows(reveal.details)} />
      {/* Hidden from assistive tech: the live region above states the same thing, three times
          rather than thirty. */}
      <p aria-hidden="true" className="text-fg-muted text-sm">
        Hiding these in {reveal.secondsLeft} seconds.
      </p>
      <div>
        <Button
          variant="secondary"
          onClick={reveal.hide}
          startIcon={<EyeOff aria-hidden="true" className="size-4" />}
        >
          Hide them now
        </Button>
      </div>
    </>
  );
}

/**
 * @example <RevealPanel cardId={card.id} />
 */
export function RevealPanel({ cardId }: RevealPanelProps) {
  const reveal = useCardReveal(cardId);
  const announcement = announcementFor(
    reveal.details !== null,
    reveal.hasRevealed,
    reveal.secondsLeft,
  );

  return (
    <Section
      title="Card details"
      description={`We ask you to confirm it is you each time, and hide the details again after ${REVEAL_SECONDS} seconds.`}
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={reveal.error} />

        {/* Mounted for the life of the panel. A live region created at the same moment as its
            message is routinely not announced, and the message that matters most here — the
            details having gone — arrives as its branch unmounts. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {reveal.details ? (
          <RevealedDetails reveal={reveal} />
        ) : (
          <div>
            <Button
              loading={reveal.loading}
              onClick={reveal.reveal}
              startIcon={<Eye aria-hidden="true" className="size-4" />}
            >
              Show my card details
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
