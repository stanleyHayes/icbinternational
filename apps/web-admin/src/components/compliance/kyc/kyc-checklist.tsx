/**
 * The things an analyst must actually have checked.
 *
 * A checklist in a compliance tool is usually theatre — boxes ticked in a rush because
 * the decision has already been made. This one is built so that it cannot be: the steps
 * the platform has recorded as complete are shown as facts and cannot be toggled, and the
 * judgement calls are the only things the analyst can tick. Approving with an unticked
 * judgement is allowed, but the panel says how many are outstanding, so the analyst has
 * to have looked at the number.
 *
 * The wording of each check is what a reviewer will read back in a year, so each one is a
 * question with a yes-or-no answer rather than a topic heading.
 */

'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';

import type { KycCase } from '@reliance/contracts';
import { Checkbox } from '@reliance/ui';

import { humaniseCode } from '@/lib/format';

/** The judgements only a person can make, in the order they are best made. */
const JUDGEMENTS = [
  {
    id: 'document-genuine',
    label: 'The identity document looks genuine and has not been altered',
  },
  { id: 'document-current', label: 'The document is within its expiry date' },
  { id: 'photo-matches', label: 'The photograph is of the person in the selfie' },
  { id: 'details-match', label: 'Name, date of birth and address match the application' },
  { id: 'address-recent', label: 'The proof of address is dated within the last three months' },
  { id: 'funds-plausible', label: 'The stated source of funds is consistent with the profile' },
  { id: 'screening-clear', label: 'Screening hits for this customer have been dealt with' },
] as const;

/** How many judgements an analyst starts with outstanding. */
export const JUDGEMENT_COUNT: number = JUDGEMENTS.length;

export interface KycChecklistProps {
  readonly record: KycCase;
  /** Told how many judgements remain, so the decision panel can word its warning. */
  readonly onOutstandingChange: (outstanding: number) => void;
}

function CompletedSteps({ record }: Readonly<{ record: KycCase }>) {
  if (record.completedSteps.length === 0) {
    return (
      <p className="font-body text-fg-muted text-sm">
        The customer has not completed any step of the application yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {record.completedSteps.map((step) => (
        <li key={step} className="font-body text-fg-muted flex items-center gap-2 text-sm">
          <Check aria-hidden="true" className="text-success size-4" />
          {humaniseCode(step)} completed
        </li>
      ))}
    </ul>
  );
}

/** What the customer has submitted, and what the analyst must judge. */
export function KycChecklist({ record, onOutstandingChange }: KycChecklistProps) {
  const [ticked, setTicked] = useState<readonly string[]>([]);

  const toggle = (id: string): void => {
    const next = ticked.includes(id)
      ? ticked.filter((candidate) => candidate !== id)
      : [...ticked, id];
    setTicked(next);
    onOutstandingChange(JUDGEMENTS.length - next.length);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h4 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
          Submitted by the customer
        </h4>
        <CompletedSteps record={record} />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
          Your checks
        </h4>
        <ul className="flex flex-col gap-2">
          {JUDGEMENTS.map((judgement) => (
            <li key={judgement.id}>
              <Checkbox
                checked={ticked.includes(judgement.id)}
                onChange={() => toggle(judgement.id)}
              >
                {judgement.label}
              </Checkbox>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
