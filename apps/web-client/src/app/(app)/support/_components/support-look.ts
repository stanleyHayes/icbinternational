'use client';

/**
 * Support vocabulary, in the customer's words.
 *
 * "AWAITING_CUSTOMER" is a queue state; "We are waiting for you" is what somebody needs to read,
 * because it is the one status on the list that means they have to do something.
 */

import { DisputeStatus, TicketStatus, TicketTopic } from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** A status as the customer reads it. */
export interface SupportLook {
  readonly label: string;
  readonly tone: Tone;
}

/** Where a ticket has got to. */
export const TICKET_STATUS: Readonly<Record<TicketStatus, SupportLook>> = {
  [TicketStatus.OPEN]: { label: 'Open', tone: 'info' },
  [TicketStatus.AWAITING_CUSTOMER]: { label: 'We are waiting for you', tone: 'pending' },
  [TicketStatus.AWAITING_AGENT]: { label: 'With us', tone: 'info' },
  [TicketStatus.ESCALATED]: { label: 'Escalated', tone: 'warning' },
  [TicketStatus.RESOLVED]: { label: 'Resolved', tone: 'credit' },
  [TicketStatus.CLOSED]: { label: 'Closed', tone: 'neutral' },
};

/** Where a dispute has got to. */
export const DISPUTE_STATUS: Readonly<Record<DisputeStatus, SupportLook>> = {
  [DisputeStatus.SUBMITTED]: { label: 'Raised', tone: 'info' },
  [DisputeStatus.UNDER_REVIEW]: { label: 'Being investigated', tone: 'pending' },
  [DisputeStatus.EVIDENCE_REQUESTED]: { label: 'We need something from you', tone: 'warning' },
  [DisputeStatus.REPRESENTED]: { label: 'The merchant has responded', tone: 'pending' },
  [DisputeStatus.ARBITRATION]: { label: 'With the card scheme', tone: 'pending' },
  [DisputeStatus.WON]: { label: 'Found in your favour', tone: 'credit' },
  [DisputeStatus.LOST]: { label: 'Not upheld', tone: 'danger' },
  [DisputeStatus.WITHDRAWN]: { label: 'Withdrawn', tone: 'neutral' },
};

/** What a ticket can be about. */
export const TOPIC_LABEL: Readonly<Record<TicketTopic, string>> = {
  [TicketTopic.ACCOUNT]: 'My accounts',
  [TicketTopic.PAYMENTS]: 'A payment',
  [TicketTopic.CARDS]: 'A card',
  [TicketTopic.LENDING]: 'Borrowing',
  [TicketTopic.FRAUD]: 'Fraud or a scam',
  [TicketTopic.TECHNICAL]: 'Something is not working',
  [TicketTopic.COMPLAINT]: 'A complaint',
  [TicketTopic.OTHER]: 'Something else',
};

/** Topics as options, in the order people pick them. */
export const TOPIC_OPTIONS = Object.entries(TOPIC_LABEL).map(([value, label]) => ({
  value,
  label,
}));

/** Why a payment is being disputed, in words. */
export const DISPUTE_REASONS = [
  { value: 'UNAUTHORISED', label: 'I did not make this payment' },
  { value: 'DUPLICATE_CHARGE', label: 'I was charged twice' },
  { value: 'GOODS_NOT_RECEIVED', label: 'I paid but never received it' },
  { value: 'GOODS_NOT_AS_DESCRIBED', label: 'What arrived was not what was described' },
  { value: 'INCORRECT_AMOUNT', label: 'The amount was wrong' },
  { value: 'SUBSCRIPTION_CANCELLED', label: 'I cancelled this subscription' },
  { value: 'REFUND_NOT_RECEIVED', label: 'A refund I was promised never came' },
  { value: 'ATM_CASH_NOT_DISPENSED', label: 'The cash machine did not give me the money' },
  { value: 'OTHER', label: 'Something else' },
];

/** The kinds of fraud a customer can report. */
export const FRAUD_KINDS = [
  { value: 'CARD_FRAUD', label: 'Someone has used my card' },
  { value: 'ACCOUNT_TAKEOVER', label: 'Someone has got into my account' },
  { value: 'PHISHING', label: 'I was sent a message or website pretending to be us' },
  { value: 'SCAM_PAYMENT', label: 'I was tricked into sending money' },
  { value: 'IDENTITY_THEFT', label: 'Someone is pretending to be me' },
];
