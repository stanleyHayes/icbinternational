import type { Prose } from '../prose';

import { COOKIES } from './cookies';
import { PRIVACY } from './privacy';
import { TERMS } from './terms';

/** The slugs `/legal/[document]` serves. */
export const LEGAL_SLUGS = ['terms', 'privacy', 'cookies'] as const;

/** One legal slug. */
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

/** A published legal document. */
export interface LegalDocument {
  readonly title: string;
  readonly description: string;
  /** ISO date. Shown at the top, because a policy with no date is not a policy. */
  readonly updatedOn: string;
  readonly body: Prose;
}

export const LEGAL_DOCUMENTS: Readonly<Record<LegalSlug, LegalDocument>> = {
  terms: {
    title: 'Terms and conditions',
    description:
      'The terms governing Reliance Bank accounts, cards and payment services — including notice ' +
      'periods, refunds for unauthorised payments and how to close an account.',
    updatedOn: '2026-04-06',
    body: TERMS,
  },
  privacy: {
    title: 'Privacy notice',
    description:
      'What personal information Reliance Bank holds, why we hold it, who we share it with, and ' +
      'the rights you have over it.',
    updatedOn: '2026-04-06',
    body: PRIVACY,
  },
  cookies: {
    title: 'Cookie policy',
    description:
      'Every cookie reliancebank.example sets, what each one does and how long it lasts. No ' +
      'advertising cookies and no third-party trackers.',
    updatedOn: '2026-02-17',
    body: COOKIES,
  },
};

/** Narrows an untrusted route segment to a published document. */
export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}
