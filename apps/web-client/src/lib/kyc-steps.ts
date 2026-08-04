/**
 * The account-opening wizard, described once.
 *
 * The order here is the contract's order, and the *server* decides which step the customer is on —
 * `KycCase.nextStep` is authoritative, and this file only translates it into a URL and a heading.
 * A wizard that keeps its own idea of progress is a wizard that puts a returning customer on a
 * step the bank has already accepted.
 */

import type { KycStep } from '@reliance/contracts';

/** One step, as the wizard presents it. */
export interface WizardStep {
  readonly step: KycStep;
  /** URL segment. Kebab-case, because `source_of_funds` in an address bar is a leak of the schema. */
  readonly slug: string;
  /** Heading for the step. */
  readonly title: string;
  /** One line under the heading: what is being asked for, and why. */
  readonly description: string;
  /** Short label for the progress indicator. */
  readonly shortLabel: string;
}

/** Every step, in the order the bank asks for them. */
export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    step: 'IDENTITY',
    slug: 'identity',
    title: 'About you',
    description:
      'Your date of birth and nationality, exactly as they appear on the ID you are going to show us.',
    shortLabel: 'About you',
  },
  {
    step: 'ADDRESS',
    slug: 'address',
    title: 'Where you live',
    description:
      'Your home address. We use it to check your identity and to post anything that has to be posted.',
    shortLabel: 'Address',
  },
  {
    step: 'EMPLOYMENT',
    slug: 'employment',
    title: 'What you do',
    description:
      'Your work and income. This sets your initial limits, and it is what we compare against if something unusual happens later.',
    shortLabel: 'Work',
  },
  {
    step: 'SOURCE_OF_FUNDS',
    slug: 'source-of-funds',
    title: 'Where your money comes from',
    description:
      'Every bank has to ask this. One honest answer now saves questions the first time a large payment arrives.',
    shortLabel: 'Funds',
  },
  {
    step: 'DOCUMENTS',
    slug: 'documents',
    title: 'Photo ID',
    description:
      'A passport, driving licence or national identity card. All four corners visible, in focus, no glare.',
    shortLabel: 'ID',
  },
  {
    step: 'LIVENESS',
    slug: 'liveness',
    title: 'A photo of you',
    description:
      'We match this against your ID. Face the camera in good light, and take off hats and sunglasses.',
    shortLabel: 'Photo',
  },
  {
    step: 'REVIEW',
    slug: 'review',
    title: 'Check and submit',
    description: 'Read it back before it goes to our team. You can change anything on this page.',
    shortLabel: 'Review',
  },
];

const BY_SLUG: ReadonlyMap<string, WizardStep> = new Map(
  WIZARD_STEPS.map((entry) => [entry.slug, entry]),
);

const BY_STEP: ReadonlyMap<KycStep, WizardStep> = new Map(
  WIZARD_STEPS.map((entry) => [entry.step, entry]),
);

/** The step a URL segment refers to, or `null` for an unknown segment. */
export function stepFromSlug(slug: string): WizardStep | null {
  return BY_SLUG.get(slug) ?? null;
}

/** The wizard entry for a contract step. */
export function wizardStep(step: KycStep): WizardStep {
  const entry = BY_STEP.get(step);
  // Every member of the contract's enum has an entry above; a miss means the contract grew a step
  // and this file was not updated, which is a defect rather than a state to render around.
  if (!entry) throw new Error(`No wizard screen is defined for the ${step} step.`);
  return entry;
}

/** How far through the wizard a step sits. Zero-based, for the progress indicator. */
export function stepIndex(step: KycStep): number {
  return WIZARD_STEPS.findIndex((entry) => entry.step === step);
}
