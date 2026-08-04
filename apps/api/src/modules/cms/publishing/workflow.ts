/**
 * The publishing state machine.
 *
 * Pure, and deliberately the only place the transitions are written down. A CMS where
 * "can this be published?" is answered by a condition in a controller is a CMS where a
 * second controller answers it differently, and the day that happens an unreviewed rates
 * page goes live.
 *
 * The states come from the frozen contract (`PublishStatus`), so the admin console and the
 * API cannot disagree about what they are called.
 */

import { PublishStatus } from '@reliance/contracts';

/** A move between states, named for what a person is doing. */
export const ContentAction = {
  SUBMIT_FOR_REVIEW: 'SUBMIT_FOR_REVIEW',
  RETURN_TO_DRAFT: 'RETURN_TO_DRAFT',
  SCHEDULE: 'SCHEDULE',
  PUBLISH: 'PUBLISH',
  UNPUBLISH: 'UNPUBLISH',
  ARCHIVE: 'ARCHIVE',
  RESTORE: 'RESTORE',
} as const;
export type ContentAction = (typeof ContentAction)[keyof typeof ContentAction];

/** Which states each action may be taken from, and what it produces. */
const TRANSITIONS: Readonly<
  Record<ContentAction, { readonly from: readonly PublishStatus[]; readonly to: PublishStatus }>
> = Object.freeze({
  [ContentAction.SUBMIT_FOR_REVIEW]: {
    from: [PublishStatus.DRAFT],
    to: PublishStatus.IN_REVIEW,
  },
  [ContentAction.RETURN_TO_DRAFT]: {
    from: [PublishStatus.IN_REVIEW, PublishStatus.SCHEDULED],
    to: PublishStatus.DRAFT,
  },
  // Scheduling requires review first. Otherwise "schedule it for tonight" becomes the
  // route around the reviewer, and it is the one people take when they are in a hurry.
  [ContentAction.SCHEDULE]: {
    from: [PublishStatus.IN_REVIEW],
    to: PublishStatus.SCHEDULED,
  },
  [ContentAction.PUBLISH]: {
    from: [PublishStatus.IN_REVIEW, PublishStatus.SCHEDULED],
    to: PublishStatus.PUBLISHED,
  },
  [ContentAction.UNPUBLISH]: {
    from: [PublishStatus.PUBLISHED],
    to: PublishStatus.DRAFT,
  },
  [ContentAction.ARCHIVE]: {
    from: [
      PublishStatus.DRAFT,
      PublishStatus.IN_REVIEW,
      PublishStatus.SCHEDULED,
      PublishStatus.PUBLISHED,
    ],
    to: PublishStatus.ARCHIVED,
  },
  [ContentAction.RESTORE]: {
    from: [PublishStatus.ARCHIVED],
    to: PublishStatus.DRAFT,
  },
});

export type TransitionResult =
  | { readonly allowed: true; readonly next: PublishStatus }
  | { readonly allowed: false; readonly reason: string };

/** Everyday names for the states, for a message a person reads. */
const STATUS_LABEL: Readonly<Record<PublishStatus, string>> = Object.freeze({
  [PublishStatus.DRAFT]: 'a draft',
  [PublishStatus.IN_REVIEW]: 'in review',
  [PublishStatus.SCHEDULED]: 'scheduled',
  [PublishStatus.PUBLISHED]: 'published',
  [PublishStatus.ARCHIVED]: 'archived',
});

const ACTION_LABEL: Readonly<Record<ContentAction, string>> = Object.freeze({
  [ContentAction.SUBMIT_FOR_REVIEW]: 'send this for review',
  [ContentAction.RETURN_TO_DRAFT]: 'return this to draft',
  [ContentAction.SCHEDULE]: 'schedule this',
  [ContentAction.PUBLISH]: 'publish this',
  [ContentAction.UNPUBLISH]: 'unpublish this',
  [ContentAction.ARCHIVE]: 'archive this',
  [ContentAction.RESTORE]: 'restore this',
});

/** Whether an action may be taken from a state, and what it produces. */
export function transition(from: PublishStatus, action: ContentAction): TransitionResult {
  const rule = TRANSITIONS[action];

  if (!rule.from.includes(from)) {
    return {
      allowed: false,
      reason: `You cannot ${ACTION_LABEL[action]} while it is ${STATUS_LABEL[from]}.`,
    };
  }

  return { allowed: true, next: rule.to };
}

/** Actions available from a state, for rendering the toolbar. */
export function availableActions(from: PublishStatus): ContentAction[] {
  return Object.values(ContentAction).filter((action) => TRANSITIONS[action].from.includes(from));
}

/** True when the public API is allowed to serve this document. */
export function isPubliclyVisible(status: PublishStatus): boolean {
  return status === PublishStatus.PUBLISHED;
}
