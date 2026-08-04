/**
 * The marketing pages the bank ships with, composed from the typed blocks in the contract.
 *
 * Real propositions with the qualifications attached. A hero that claims "the best savings
 * rate" without saying which account, at what balance, on what notice, is the kind of copy
 * a regulator asks about — so every claim here carries its condition.
 */

import { ContentKind } from '../cms.constants.js';

import { seo, type CatalogueEntry } from './catalogue.types.js';

const OPEN_ACCOUNT = { label: 'Open an account', href: '/open-account' };

export const PAGE_CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  {
    kind: ContentKind.PAGE,
    slug: 'home',
    title: 'Banking that stays out of your way',
    order: 1,
    seo: seo(
      'Reliance Bank | Everyday banking, savings and loans',
      'A current account with no monthly fee, savings from 3.10% AER and loans from 7.9% APR representative. Open an account in about ten minutes.',
    ),
    payload: {
      blocks: [
        {
          id: 'hero',
          type: 'HERO',
          props: {
            eyebrow: 'Personal banking',
            heading: 'Banking that stays out of your way',
            body: 'A current account with no monthly fee, payments that arrive in seconds, and a team on the phone at four in the morning if you need one.',
            primaryCta: OPEN_ACCOUNT,
            secondaryCta: { label: 'Compare accounts', href: '/personal/current-accounts' },
          },
        },
        {
          id: 'products',
          type: 'PRODUCT_CARDS',
          props: {
            heading: 'Three things most people come to us for',
            cards: [
              {
                title: 'Everyday Current Account',
                body: 'No monthly fee. Free UK payments. A card you can freeze from your phone in one tap.',
                href: '/personal/current-accounts',
              },
              {
                title: 'Reliance Saver',
                body: '3.10% AER variable on any balance from £1, with no notice period and no withdrawal charge.',
                href: '/personal/savings',
              },
              {
                title: 'Personal Loan',
                body: '7.9% APR representative on £15,000 to £25,000 over one to seven years. Check your rate without affecting your credit score.',
                href: '/borrow/loans',
              },
            ],
          },
        },
        {
          id: 'trust',
          type: 'STATS',
          props: {
            heading: 'The parts that should be boring',
            stats: [
              { value: '£85,000', label: 'Protected per depositor by the FSCS' },
              { value: '24 hours', label: 'A person on the phone, every day of the year' },
              { value: 'Under 2 hours', label: 'Median time from application to open account' },
              { value: '£0', label: 'Monthly account fee' },
            ],
          },
        },
        {
          id: 'security',
          type: 'FEATURE_GRID',
          props: {
            heading: 'Security you can actually use',
            features: [
              {
                title: 'Freeze in one tap',
                body: 'Mislaid your card? Freeze it instantly and unfreeze it when it turns up in the coat pocket. Nothing is lost by freezing.',
              },
              {
                title: 'Passkeys, not passwords',
                body: 'Sign in with your face or fingerprint. A passkey never leaves your device and cannot be phished.',
              },
              {
                title: 'We tell you first',
                body: 'A new payee, a sign-in from a device we do not recognise, a payment we have held — you hear about it as it happens.',
              },
              {
                title: 'Every change announced',
                body: 'Change your address or your email and we tell you, on the old details as well as the new.',
              },
            ],
          },
        },
        {
          id: 'cta',
          type: 'CTA',
          props: {
            heading: 'Ten minutes, and a photo of your ID',
            body: 'Most applications are decided within the hour. Your card arrives within three working days, and you can pay with your phone before it does.',
            primaryCta: OPEN_ACCOUNT,
          },
        },
      ],
    },
  },
  {
    kind: ContentKind.PAGE,
    slug: 'personal/current-accounts',
    title: 'Everyday Current Account',
    order: 2,
    seo: seo(
      'Everyday Current Account | Reliance Bank',
      'No monthly fee, free payments within the UK, and no charge for spending abroad at the Mastercard rate.',
    ),
    payload: {
      blocks: [
        {
          id: 'hero',
          type: 'HERO',
          props: {
            eyebrow: 'Current accounts',
            heading: 'Everyday Current Account',
            body: 'No monthly fee, no minimum balance, and no charge for spending abroad. An arranged overdraft is available if you want one, at 39.9% EAR variable.',
            primaryCta: OPEN_ACCOUNT,
          },
        },
        {
          id: 'features',
          type: 'FEATURE_GRID',
          props: {
            heading: 'What you get',
            features: [
              {
                title: 'Free UK payments',
                body: 'Faster Payments in seconds, any amount, at no charge.',
              },
              {
                title: 'Spending abroad',
                body: 'At the Mastercard rate with nothing added. Cash abroad is free up to £250 a month, then £2 a withdrawal.',
              },
              {
                title: 'Your money, categorised',
                body: 'Spending grouped automatically, with budgets that warn you before you pass them.',
              },
              {
                title: 'Round-ups',
                body: 'Round every card payment to the nearest pound and put the difference into a savings goal.',
              },
            ],
          },
        },
        {
          id: 'comparison',
          type: 'COMPARISON_TABLE',
          props: {
            heading: 'Everyday against Everyday Plus',
            columns: ['Everyday', 'Everyday Plus'],
            rows: [
              { label: 'Monthly fee', values: ['£0', '£9'] },
              { label: 'UK payments', values: ['Free', 'Free'] },
              { label: 'Cash abroad', values: ['Free to £250/month', 'Always free'] },
              { label: 'Worldwide travel insurance', values: ['Not included', 'Included'] },
              { label: 'Mobile phone insurance', values: ['Not included', 'Included'] },
              { label: 'Interest on balances to £2,000', values: ['None', '2.00% AER variable'] },
            ],
          },
        },
        {
          id: 'faq',
          type: 'FAQ',
          props: { category: 'Current accounts' },
        },
      ],
    },
  },
  {
    kind: ContentKind.PAGE,
    slug: 'personal/savings',
    title: 'Savings',
    order: 3,
    seo: seo(
      'Savings accounts | Reliance Bank',
      'Easy access from 3.10% AER variable, fixed terms to 4.55% AER, and a Cash ISA at 4.25% AER tax free.',
    ),
    payload: {
      blocks: [
        {
          id: 'hero',
          type: 'HERO',
          props: {
            eyebrow: 'Savings',
            heading: 'Somewhere sensible to put it',
            body: 'Easy access from £1, fixed terms if you can leave it alone, and a Cash ISA if you have allowance left. Every rate is on this page and changes are announced before they happen.',
            primaryCta: { label: 'See every rate', href: '/rates' },
          },
        },
        { id: 'rates', type: 'RATE_TABLE', props: { source: 'savings' } },
        {
          id: 'calculator',
          type: 'CALCULATOR',
          props: { kind: 'SAVINGS', heading: 'What would that come to?' },
        },
        {
          id: 'steps',
          type: 'STEPS',
          props: {
            heading: 'Opening one takes about two minutes',
            steps: [
              { title: 'Choose an account', body: 'Easy access, notice, fixed term or ISA.' },
              {
                title: 'Move money in',
                body: 'From your current account, instantly, or from another bank.',
              },
              {
                title: 'Watch it earn',
                body: 'Interest is calculated daily and paid monthly on most accounts.',
              },
            ],
          },
        },
      ],
    },
  },
]);
