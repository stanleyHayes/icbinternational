/**
 * Account servicing: balances, overdrafts, statements, interest and closure.
 *
 * The low-balance and overdraft messages are the two customers judge a bank on. They say
 * what will happen, when, and what it will cost in pounds rather than in a percentage —
 * a customer deciding whether to move money tonight needs the figure, not the rate.
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

/** Where a customer goes to fix a low balance. Referenced by three of these messages. */
const MOVE_MONEY_PATH = '/transfers/new';

export const ACCOUNT_TEMPLATES = {
  LOW_BALANCE: defineTemplate({
    key: 'LOW_BALANCE',
    category: NotificationCategory.ACCOUNT,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: {
      accountName: 'Everyday Current Account',
      balanceFormatted: '£38.11',
      thresholdFormatted: '£50.00',
      nextPaymentSummary: '£94.20 to Northgate Energy on 3 April',
    },
    compose: (
      props: {
        accountName: string;
        balanceFormatted: string;
        thresholdFormatted: string;
        nextPaymentSummary: string;
      },
      links,
    ) => ({
      subject: `Your balance is ${props.balanceFormatted}`,
      preheader: `Below the ${props.thresholdFormatted} you asked us to watch for.`,
      heading: 'Your balance is running low',
      summary: `Your ${props.accountName} is down to ${props.balanceFormatted}.`,
      nodes: [
        amount('Balance', props.balanceFormatted, AmountDirection.NEUTRAL),
        paragraph(
          `That is below the ${props.thresholdFormatted} you asked us to tell you about. Your next scheduled payment is ${props.nextPaymentSummary}.`,
        ),
        paragraph(
          'If the balance will not cover it, moving money in before the payment date avoids a returned payment and the fee that comes with it.',
        ),
        button('Move money in', links.app(MOVE_MONEY_PATH)),
      ],
      action: { label: 'Move money in', url: links.app(MOVE_MONEY_PATH) },
    }),
  }),

  OVERDRAFT_USED: defineTemplate({
    key: 'OVERDRAFT_USED',
    category: NotificationCategory.ACCOUNT,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: {
      balanceFormatted: '−£128.40',
      arrangedLimitFormatted: '£500.00',
      dailyCostFormatted: '£0.14',
      interestRate: '39.9% EAR variable',
    },
    compose: (
      props: {
        balanceFormatted: string;
        arrangedLimitFormatted: string;
        dailyCostFormatted: string;
        interestRate: string;
      },
      links,
    ) => ({
      subject: 'You are using your arranged overdraft',
      preheader: `Costing about ${props.dailyCostFormatted} a day at today's balance.`,
      heading: 'You are into your overdraft',
      summary: `Your balance is ${props.balanceFormatted} and interest is accruing.`,
      nodes: [
        details([
          { label: 'Balance', value: props.balanceFormatted },
          { label: 'Arranged limit', value: props.arrangedLimitFormatted },
          { label: 'Rate', value: props.interestRate },
          { label: 'Cost at this balance', value: `About ${props.dailyCostFormatted} a day` },
        ]),
        paragraph(
          'Interest is charged daily on the amount you are overdrawn and collected once a month. Paying in reduces the interest from that day.',
        ),
        callout(
          Tone.CAUTION,
          'If you go past your arranged limit we may return payments. We will always tell you before we do.',
        ),
        button('Pay in now', links.app(MOVE_MONEY_PATH)),
      ],
      action: { label: 'Pay in now', url: links.app(MOVE_MONEY_PATH) },
    }),
  }),

  STATEMENT_READY: defineTemplate({
    key: 'STATEMENT_READY',
    category: NotificationCategory.STATEMENT,
    fixture: {
      accountName: 'Everyday Current Account',
      periodLabel: 'February 2026',
      moneyInFormatted: '£3,412.00',
      moneyOutFormatted: '£2,988.51',
      closingFormatted: '£2,318.42',
    },
    compose: (
      props: {
        accountName: string;
        periodLabel: string;
        moneyInFormatted: string;
        moneyOutFormatted: string;
        closingFormatted: string;
      },
      links,
    ) => ({
      subject: `Your ${props.periodLabel} statement is ready`,
      preheader: `${props.accountName} · closing balance ${props.closingFormatted}.`,
      heading: `Your ${props.periodLabel} statement`,
      summary: `Your ${props.periodLabel} statement for the ${props.accountName} is ready.`,
      nodes: [
        details([
          { label: 'Account', value: props.accountName },
          { label: 'Period', value: props.periodLabel },
          { label: 'Money in', value: props.moneyInFormatted },
          { label: 'Money out', value: props.moneyOutFormatted },
          { label: 'Closing balance', value: props.closingFormatted },
        ]),
        paragraph(
          'The full statement is in the app as a PDF. We keep every statement for seven years, and you can download any of them at any time.',
        ),
        button('Download your statement', links.app('/statements')),
      ],
      action: { label: 'Download your statement', url: links.app('/statements') },
    }),
  }),

  INTEREST_PAID: defineTemplate({
    key: 'INTEREST_PAID',
    category: NotificationCategory.SAVINGS,
    severity: NotificationSeverity.SUCCESS,
    fixture: {
      accountName: 'Reliance Saver',
      interestFormatted: '£18.42',
      periodLabel: 'February 2026',
      rateLabel: '4.10% AER variable',
    },
    compose: (
      props: {
        accountName: string;
        interestFormatted: string;
        periodLabel: string;
        rateLabel: string;
      },
      links,
    ) => ({
      subject: `${props.interestFormatted} interest paid to your ${props.accountName}`,
      preheader: `For ${props.periodLabel} at ${props.rateLabel}.`,
      heading: 'Interest paid',
      summary: `${props.interestFormatted} interest was paid to your ${props.accountName}.`,
      nodes: [
        amount('Interest paid', props.interestFormatted, AmountDirection.CREDIT),
        details([
          { label: 'Account', value: props.accountName },
          { label: 'Period', value: props.periodLabel },
          { label: 'Rate', value: props.rateLabel },
        ]),
        paragraph(
          'Interest is paid gross. Whether any tax is due depends on your personal savings allowance and your circumstances.',
        ),
        button('View your savings', links.app('/savings')),
      ],
    }),
  }),
} as const;
