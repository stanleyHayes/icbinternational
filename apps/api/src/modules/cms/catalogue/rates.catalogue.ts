/**
 * The rates and fees the bank publishes.
 *
 * Rates are stored as **basis points** — hundredths of a percent, as integers — and fees
 * as **minor units**. Both for the same reason the ledger holds money in integers: a
 * published rate is a promise, and a promise stored as a float is one rounding away from
 * being a different promise. The site formats them for display; nothing multiplies them.
 */

import { ContentKind } from '../cms.constants.js';

import { seo, type CatalogueEntry } from './catalogue.types.js';

export const RATE_CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  {
    kind: ContentKind.RATE_TABLE,
    slug: 'savings',
    title: 'Savings rates',
    order: 1,
    seo: seo(
      'Savings rates | Reliance Bank',
      'Current interest rates on every Reliance Bank savings account, updated whenever they change.',
    ),
    payload: {
      effectiveFrom: '2026-03-01',
      note: 'AER stands for Annual Equivalent Rate and shows what the rate would be if interest were paid and compounded once a year. Rates marked variable can change; we give you notice before a reduction.',
      rows: [
        {
          product: 'Easy Access Saver',
          rateBasisPoints: 310,
          rateLabel: '3.10% AER variable',
          minimumOpeningMinorUnits: 100,
          access: 'Withdraw any time, no notice, no charge',
          interestPaid: 'Monthly',
        },
        {
          product: '90 Day Notice Saver',
          rateBasisPoints: 395,
          rateLabel: '3.95% AER variable',
          minimumOpeningMinorUnits: 100_000,
          access: '90 days notice to withdraw without losing interest',
          interestPaid: 'Monthly',
        },
        {
          product: '1 Year Fixed Saver',
          rateBasisPoints: 455,
          rateLabel: '4.55% AER fixed',
          minimumOpeningMinorUnits: 100_000,
          access: 'No withdrawals until maturity',
          interestPaid: 'At maturity',
        },
        {
          product: '2 Year Fixed Saver',
          rateBasisPoints: 440,
          rateLabel: '4.40% AER fixed',
          minimumOpeningMinorUnits: 100_000,
          access: 'No withdrawals until maturity',
          interestPaid: 'Annually',
        },
        {
          product: 'Cash ISA',
          rateBasisPoints: 425,
          rateLabel: '4.25% AER variable, tax free',
          minimumOpeningMinorUnits: 100,
          access: 'Withdraw any time; withdrawals may affect your allowance',
          interestPaid: 'Monthly',
        },
      ],
    },
  },
  {
    kind: ContentKind.RATE_TABLE,
    slug: 'borrowing',
    title: 'Borrowing rates',
    order: 2,
    seo: seo(
      'Loan and overdraft rates | Reliance Bank',
      'Representative APRs for Reliance Bank personal loans, overdrafts and credit.',
    ),
    payload: {
      effectiveFrom: '2026-03-01',
      note: 'Representative APR is the rate at least 51% of accepted applicants receive. Your rate depends on your circumstances and may be higher. Checking your eligibility does not affect your credit score.',
      rows: [
        {
          product: 'Personal Loan £1,000–£4,999',
          rateBasisPoints: 1490,
          rateLabel: '14.9% APR representative',
          term: '1 to 5 years',
          earlyRepayment: 'No charge',
        },
        {
          product: 'Personal Loan £5,000–£14,999',
          rateBasisPoints: 990,
          rateLabel: '9.9% APR representative',
          term: '1 to 7 years',
          earlyRepayment: 'No charge',
        },
        {
          product: 'Personal Loan £15,000–£25,000',
          rateBasisPoints: 790,
          rateLabel: '7.9% APR representative',
          term: '1 to 7 years',
          earlyRepayment: 'No charge',
        },
        {
          product: 'Arranged overdraft',
          rateBasisPoints: 3990,
          rateLabel: '39.9% EAR variable',
          term: 'Reviewed annually',
          earlyRepayment: 'Interest charged daily on what you use',
        },
      ],
    },
  },
  {
    kind: ContentKind.FEE_SCHEDULE,
    slug: 'personal',
    title: 'Personal account fees and charges',
    order: 1,
    seo: seo(
      'Fees and charges | Reliance Bank',
      'Every fee on a Reliance Bank personal account, in one table. No monthly account fee.',
    ),
    payload: {
      effectiveFrom: '2026-03-01',
      note: 'There is no monthly fee for a Reliance Bank current account, and nothing in this table applies unless you use the service it describes.',
      groups: [
        {
          heading: 'Everyday banking',
          rows: [
            { item: 'Monthly account fee', feeMinorUnits: 0, detail: 'No monthly fee, ever' },
            {
              item: 'Payments within the UK',
              feeMinorUnits: 0,
              detail: 'Faster Payments, any amount',
            },
            {
              item: 'Direct Debits and standing orders',
              feeMinorUnits: 0,
              detail: 'Set up and run free',
            },
            { item: 'Cash withdrawal in the UK', feeMinorUnits: 0, detail: 'At any cash machine' },
            {
              item: 'Replacement debit card',
              feeMinorUnits: 0,
              detail: 'Including lost or stolen',
            },
          ],
        },
        {
          heading: 'Abroad',
          rows: [
            {
              item: 'Card payments abroad',
              feeMinorUnits: 0,
              detail: 'At the Mastercard rate, no added margin',
            },
            {
              item: 'Cash withdrawal abroad',
              feeMinorUnits: 200,
              detail: 'Per withdrawal, after the first £250 each month',
            },
            {
              item: 'International payment (SWIFT)',
              feeMinorUnits: 1200,
              detail: 'Per payment sent; receiving is free',
            },
          ],
        },
        {
          heading: 'When something goes wrong',
          rows: [
            {
              item: 'Returned Direct Debit',
              feeMinorUnits: 0,
              detail: 'We do not charge for this',
            },
            {
              item: 'Unarranged overdraft',
              feeMinorUnits: 0,
              detail: 'No fee; interest at the arranged rate',
            },
            {
              item: 'Copy of a statement',
              feeMinorUnits: 0,
              detail: 'Free in the app, going back seven years',
            },
            {
              item: 'CHAPS payment',
              feeMinorUnits: 2500,
              detail: 'Same-day guaranteed, per payment',
            },
          ],
        },
      ],
    },
  },
]);
