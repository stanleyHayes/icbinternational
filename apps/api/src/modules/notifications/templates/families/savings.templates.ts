/**
 * Saving: goals, round-ups, fixed-term deposits and rate changes.
 *
 * A rate change is a regulated notice. When a rate falls we are required to give notice,
 * so the template states the old rate, the new rate, the date it changes and the fact that
 * the customer may leave without penalty. Those four facts are not optional and are not
 * softened.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import {
  AmountDirection,
  amount,
  button,
  callout,
  details,
  paragraph,
  Tone,
} from '../render/email-node.js';

const SAVINGS_PATH = '/savings';
const VIEW_SAVINGS = 'View your savings';

export const SAVINGS_TEMPLATES = {
  GOAL_REACHED: defineTemplate({
    key: 'GOAL_REACHED',
    category: NotificationCategory.SAVINGS,
    severity: NotificationSeverity.SUCCESS,
    fixture: { goalName: 'Kitchen', targetFormatted: '£4,000.00', monthsTaken: '11' },
    compose: (
      props: { goalName: string; targetFormatted: string; monthsTaken: string },
      links,
    ) => ({
      subject: `You have reached your ${props.goalName} goal`,
      preheader: `${props.targetFormatted} saved in ${props.monthsTaken} months.`,
      heading: `${props.goalName}: target reached`,
      summary: `You reached your ${props.goalName} goal of ${props.targetFormatted}.`,
      nodes: [
        amount('Saved', props.targetFormatted, AmountDirection.CREDIT),
        paragraph(
          `You got there in ${props.monthsTaken} months. The money is yours to spend whenever you want it.`,
        ),
        paragraph(
          'If you are not ready to spend it, leaving it where it is keeps earning interest. You can also raise the target and keep going.',
        ),
        button(VIEW_SAVINGS, links.app(SAVINGS_PATH)),
      ],
      action: { label: VIEW_SAVINGS, url: links.app(SAVINGS_PATH) },
    }),
  }),

  ROUND_UP_SUMMARY: defineTemplate({
    key: 'ROUND_UP_SUMMARY',
    category: NotificationCategory.SAVINGS,
    fixture: {
      periodLabel: 'March',
      totalFormatted: '£31.47',
      transactionCount: '86',
      goalName: 'Kitchen',
    },
    compose: (
      props: {
        periodLabel: string;
        totalFormatted: string;
        transactionCount: string;
        goalName: string;
      },
      links,
    ) => ({
      subject: `Round-ups added ${props.totalFormatted} in ${props.periodLabel}`,
      preheader: `From ${props.transactionCount} payments, into ${props.goalName}.`,
      heading: `Your ${props.periodLabel} round-ups`,
      summary: `Round-ups added ${props.totalFormatted} to ${props.goalName} in ${props.periodLabel}.`,
      nodes: [
        amount('Rounded up', props.totalFormatted, AmountDirection.CREDIT),
        details([
          { label: 'Payments rounded up', value: props.transactionCount },
          { label: 'Went to', value: props.goalName },
          { label: 'Period', value: props.periodLabel },
        ]),
        button(VIEW_SAVINGS, links.app(SAVINGS_PATH)),
      ],
    }),
  }),

  DEPOSIT_MATURING: defineTemplate({
    key: 'DEPOSIT_MATURING',
    category: NotificationCategory.SAVINGS,
    severity: NotificationSeverity.WARNING,
    fixture: {
      productName: '1 Year Fixed Saver',
      maturityDate: '12 April 2026',
      balanceFormatted: '£12,400.00',
      currentRate: '4.55% AER',
      defaultAction: 'move to an Easy Access Saver at 2.80% AER',
    },
    compose: (
      props: {
        productName: string;
        maturityDate: string;
        balanceFormatted: string;
        currentRate: string;
        defaultAction: string;
      },
      links,
    ) => ({
      subject: `Your ${props.productName} matures on ${props.maturityDate}`,
      preheader: 'Tell us what you would like to do with it.',
      heading: 'Your fixed term is ending',
      summary: `Your ${props.productName} matures on ${props.maturityDate}.`,
      nodes: [
        details([
          { label: 'Product', value: props.productName },
          { label: 'Matures', value: props.maturityDate },
          { label: 'Balance', value: props.balanceFormatted },
          { label: 'Current rate', value: props.currentRate },
        ]),
        callout(
          Tone.CAUTION,
          `If you tell us nothing, we will ${props.defaultAction}. That is almost certainly not the best rate available to you.`,
        ),
        paragraph(
          'You have until the maturity date to choose a new fixed term, move the money elsewhere, or take it out.',
        ),
        button('Choose what happens next', links.app('/savings/deposits')),
      ],
      action: { label: 'Choose what happens next', url: links.app('/savings/deposits') },
    }),
  }),

  DEPOSIT_MATURED: defineTemplate({
    key: 'DEPOSIT_MATURED',
    category: NotificationCategory.SAVINGS,
    fixture: {
      productName: '1 Year Fixed Saver',
      interestFormatted: '£564.20',
      totalFormatted: '£12,964.20',
      destinationName: 'Easy Access Saver',
    },
    compose: (
      props: {
        productName: string;
        interestFormatted: string;
        totalFormatted: string;
        destinationName: string;
      },
      links,
    ) => ({
      subject: `Your ${props.productName} has matured`,
      preheader: `${props.interestFormatted} interest earned.`,
      heading: 'Your fixed term has ended',
      summary: `Your ${props.productName} matured and earned ${props.interestFormatted}.`,
      nodes: [
        amount('Interest earned', props.interestFormatted, AmountDirection.CREDIT),
        details([
          { label: 'Total now', value: props.totalFormatted },
          { label: 'Held in', value: props.destinationName },
        ]),
        paragraph(
          'The money is available immediately. If you want to fix it again, our current terms and rates are in the app.',
        ),
        button(VIEW_SAVINGS, links.app(SAVINGS_PATH)),
      ],
    }),
  }),

  SAVINGS_RATE_CHANGE: defineTemplate({
    key: 'SAVINGS_RATE_CHANGE',
    category: NotificationCategory.SAVINGS,
    severity: NotificationSeverity.WARNING,
    fixture: {
      accountName: 'Easy Access Saver',
      oldRate: '3.10% AER variable',
      newRate: '2.80% AER variable',
      effectiveDate: '1 June 2026',
      direction: 'down',
    },
    compose: (
      props: {
        accountName: string;
        oldRate: string;
        newRate: string;
        effectiveDate: string;
        direction: string;
      },
      links,
    ) => ({
      subject: `Your ${props.accountName} rate is changing on ${props.effectiveDate}`,
      preheader: `From ${props.oldRate} to ${props.newRate}.`,
      heading: 'Your savings rate is changing',
      summary: `Your ${props.accountName} rate changes to ${props.newRate} on ${props.effectiveDate}.`,
      nodes: [
        details([
          { label: 'Account', value: props.accountName },
          { label: 'Rate now', value: props.oldRate },
          { label: 'Rate from', value: `${props.effectiveDate}: ${props.newRate}` },
        ]),
        props.direction === 'down'
          ? callout(
              Tone.CAUTION,
              'You are free to move your money at any time, with no notice period and no charge. If you would like to close the account before the change, you can.',
            )
          : callout(
              Tone.POSITIVE,
              'You do not need to do anything. The new rate applies automatically.',
            ),
        paragraph(
          'Interest is calculated daily and paid monthly. AER assumes interest is left in the account.',
        ),
        button('Compare our savings rates', links.site('/savings/rates')),
      ],
    }),
  }),

  AUTOSAVE_PAUSED: defineTemplate({
    key: 'AUTOSAVE_PAUSED',
    category: NotificationCategory.SAVINGS,
    fixture: { goalName: 'Kitchen', reason: 'your balance was too low on the transfer date' },
    compose: (props: { goalName: string; reason: string }, links) => ({
      subject: `We paused your automatic saving into ${props.goalName}`,
      preheader: 'No payment was taken.',
      heading: 'Automatic saving is paused',
      summary: `Automatic saving into ${props.goalName} is paused.`,
      nodes: [
        paragraph(
          `We did not move money into ${props.goalName} this time because ${props.reason}. Nothing was taken and nothing has gone wrong with the goal.`,
        ),
        paragraph(
          'Automatic saving resumes on the next scheduled date. If you would rather it saved a smaller amount, you can change it in the app.',
        ),
        button('Adjust your goal', links.app(SAVINGS_PATH)),
      ],
      action: { label: 'Adjust your goal', url: links.app(SAVINGS_PATH) },
    }),
  }),
} as const;
