/**
 * Support and disputes.
 *
 * A dispute email carries dates. A customer who has lost money wants to know how long they
 * will wait and when they will hear next, and a bank that gives that in writing is one that
 * has to keep to it.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import {
  AmountDirection,
  amount,
  bullets,
  button,
  callout,
  details,
  paragraph,
  Tone,
} from '../render/email-node.js';

const DISPUTES_PATH = '/disputes';

export const SUPPORT_TEMPLATES = {
  TICKET_RECEIVED: defineTemplate({
    key: 'TICKET_RECEIVED',
    category: NotificationCategory.SUPPORT,
    fixture: {
      reference: 'RS-99214',
      subjectLine: 'Direct Debit taken twice',
      respondBy: 'tomorrow, 5pm',
    },
    compose: (props: { reference: string; subjectLine: string; respondBy: string }, links) => ({
      subject: `We have your message — ${props.reference}`,
      preheader: `We will reply by ${props.respondBy}.`,
      heading: 'We have your message',
      summary: `Your message "${props.subjectLine}" is with us as ${props.reference}.`,
      nodes: [
        details([
          { label: 'Reference', value: props.reference },
          { label: 'Subject', value: props.subjectLine },
          { label: 'We will reply by', value: props.respondBy },
        ]),
        paragraph(
          'You can reply in the app and the whole conversation stays in one place. If it is urgent, call us on 0800 019 4400.',
        ),
        button('Open the conversation', links.app('/support')),
      ],
      action: { label: 'Open the conversation', url: links.app('/support') },
    }),
  }),

  TICKET_REPLY: defineTemplate({
    key: 'TICKET_REPLY',
    category: NotificationCategory.SUPPORT,
    fixture: {
      reference: 'RS-99214',
      agentName: 'Priya',
      excerpt: 'I have refunded the duplicate collection…',
    },
    compose: (props: { reference: string; agentName: string; excerpt: string }, links) => ({
      subject: `${props.agentName} has replied — ${props.reference}`,
      preheader: props.excerpt,
      heading: `${props.agentName} has replied`,
      summary: `${props.agentName} replied to ${props.reference}.`,
      nodes: [
        paragraph(props.excerpt),
        paragraph('Read the full reply and respond in the app.'),
        button('Read the reply', links.app('/support')),
      ],
      action: { label: 'Read the reply', url: links.app('/support') },
    }),
  }),

  TICKET_RESOLVED: defineTemplate({
    key: 'TICKET_RESOLVED',
    category: NotificationCategory.SUPPORT,
    severity: NotificationSeverity.SUCCESS,
    fixture: {
      reference: 'RS-99214',
      outcome: 'The duplicate collection of £94.20 has been refunded.',
    },
    compose: (props: { reference: string; outcome: string }, links) => ({
      subject: `${props.reference} is resolved`,
      preheader: props.outcome,
      heading: 'We have closed your case',
      summary: `${props.reference} is resolved.`,
      nodes: [
        paragraph(props.outcome),
        paragraph(
          'If this did not resolve it, reply and the case reopens with the same reference and the same person.',
        ),
        paragraph(
          'If you are unhappy with how we handled it, you can ask us for a final response and then refer the complaint to the Financial Ombudsman Service free of charge.',
        ),
        button('Tell us how we did', links.app('/support')),
      ],
    }),
  }),

  DISPUTE_RAISED: defineTemplate({
    key: 'DISPUTE_RAISED',
    category: NotificationCategory.SUPPORT,
    fixture: {
      reference: 'DS-44012',
      merchantName: 'Northbound Travel',
      amountFormatted: '£312.00',
      decisionBy: '12 April 2026',
    },
    compose: (
      props: {
        reference: string;
        merchantName: string;
        amountFormatted: string;
        decisionBy: string;
      },
      links,
    ) => ({
      subject: `We are investigating ${props.amountFormatted} at ${props.merchantName}`,
      preheader: `Reference ${props.reference}. Decision by ${props.decisionBy}.`,
      heading: 'Your dispute is open',
      summary: `We are investigating ${props.amountFormatted} at ${props.merchantName}.`,
      nodes: [
        amount('Disputed', props.amountFormatted, AmountDirection.PENDING),
        details([
          { label: 'Merchant', value: props.merchantName },
          { label: 'Reference', value: props.reference },
          { label: 'Decision by', value: props.decisionBy },
        ]),
        paragraph('Here is what happens now:'),
        bullets([
          'We put the money back into your account while we investigate. This is provisional.',
          'We ask the merchant for their evidence. They have 30 days to respond.',
          'If the claim succeeds the credit becomes permanent. If it does not, we take it back and tell you first.',
        ]),
        button('Track your dispute', links.app(DISPUTES_PATH)),
      ],
      action: { label: 'Track your dispute', url: links.app(DISPUTES_PATH) },
    }),
  }),

  DISPUTE_UPDATE: defineTemplate({
    key: 'DISPUTE_UPDATE',
    category: NotificationCategory.SUPPORT,
    fixture: {
      reference: 'DS-44012',
      stage: 'The merchant has sent us their evidence',
      whatWeNeed: 'Nothing from you right now.',
      nextUpdateBy: '5 April 2026',
    },
    compose: (
      props: {
        reference: string;
        stage: string;
        whatWeNeed: string;
        nextUpdateBy: string;
      },
      links,
    ) => ({
      subject: `Update on your dispute ${props.reference}`,
      preheader: props.stage,
      heading: 'An update on your dispute',
      summary: `${props.reference}: ${props.stage}.`,
      nodes: [
        details([
          { label: 'Reference', value: props.reference },
          { label: 'Where it is', value: props.stage },
          { label: 'What we need', value: props.whatWeNeed },
          { label: 'Next update by', value: props.nextUpdateBy },
        ]),
        button('See the full history', links.app(DISPUTES_PATH)),
      ],
      action: { label: 'See the full history', url: links.app(DISPUTES_PATH) },
    }),
  }),

  DISPUTE_RESOLVED: defineTemplate({
    key: 'DISPUTE_RESOLVED',
    category: NotificationCategory.SUPPORT,
    urgent: true,
    fixture: {
      reference: 'DS-44012',
      amountFormatted: '£312.00',
      upheld: true,
      explanation: 'The merchant could not show the service was provided.',
    },
    compose: (
      props: {
        reference: string;
        amountFormatted: string;
        upheld: boolean;
        explanation: string;
      },
      links,
    ) => ({
      subject: props.upheld
        ? `You are getting ${props.amountFormatted} back`
        : `Our decision on your dispute ${props.reference}`,
      preheader: props.explanation,
      heading: props.upheld ? 'Your dispute succeeded' : 'Our decision on your dispute',
      summary: props.upheld
        ? `Your dispute succeeded and ${props.amountFormatted} is yours to keep.`
        : `We were not able to recover ${props.amountFormatted}.`,
      nodes: [
        props.upheld
          ? amount('Refunded', props.amountFormatted, AmountDirection.CREDIT)
          : amount('Not recovered', props.amountFormatted, AmountDirection.NEUTRAL),
        paragraph(props.explanation),
        props.upheld
          ? paragraph(
              'The credit in your account is now permanent. There is nothing further to do.',
            )
          : callout(
              Tone.CAUTION,
              'We will take back the provisional credit in 14 days. If you have new evidence, send it before then and we will look again.',
            ),
        paragraph(
          'If you disagree with this outcome you can refer it to the Financial Ombudsman Service, free of charge, within six months.',
        ),
        button('See the decision', links.app(DISPUTES_PATH)),
      ],
      action: { label: 'See the decision', url: links.app(DISPUTES_PATH) },
    }),
  }),

  FRAUD_REPORT_RECEIVED: defineTemplate({
    key: 'FRAUD_REPORT_RECEIVED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.CRITICAL,
    urgent: true,
    fixture: { reference: 'FR-10228', contactBy: 'within 2 hours' },
    compose: (props: { reference: string; contactBy: string }) => ({
      subject: 'We have your fraud report',
      preheader: `Reference ${props.reference}. Our team will call you ${props.contactBy}.`,
      heading: 'We have your fraud report',
      summary: `Your fraud report ${props.reference} is with our team.`,
      nodes: [
        paragraph(
          `Our fraud team has your report and will call you ${props.contactBy}. Your reference is ${props.reference}.`,
        ),
        paragraph('While you wait:'),
        bullets([
          'Freeze any card you think has been compromised — you can do it in the app in one tap.',
          'Do not respond to anyone who contacts you about this claiming to be us. We will call you on the number we already hold.',
          'Keep any messages or emails from the fraudster. They help the investigation.',
        ]),
        callout(
          Tone.CRITICAL,
          'We will never ask you to move money to a "safe account". No bank ever will. Anyone who does is committing fraud.',
        ),
      ],
    }),
  }),
} as const;
