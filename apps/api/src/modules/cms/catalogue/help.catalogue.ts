/**
 * The help centre and the legal shelf.
 *
 * Answers that answer the question. "Contact us for more information" is not an FAQ entry,
 * it is a way of not writing one, and a help centre made of those is why customers phone.
 */

import { ContentKind } from '../cms.constants.js';

import { seo, type CatalogueEntry } from './catalogue.types.js';

interface FaqSeed {
  readonly slug: string;
  readonly question: string;
  readonly answer: string;
  readonly category: string;
}

const FAQS: readonly FaqSeed[] = Object.freeze([
  {
    slug: 'how-long-to-open',
    question: 'How long does it take to open an account?',
    answer:
      'About ten minutes to apply, and most applications are decided within the hour during the working day. You will need a photo of your passport or driving licence and a UK address. If our automated checks cannot confirm your identity we will email you and ask for one more document; that usually adds a couple of hours rather than days.',
    category: 'Opening an account',
  },
  {
    slug: 'when-does-my-card-arrive',
    question: 'When will my card arrive?',
    answer:
      'Within three working days of your account opening, to the address on your account. Your PIN is in the app immediately — we do not post it separately. You can add the card to Apple Pay or Google Pay and start spending before the plastic arrives.',
    category: 'Cards',
  },
  {
    slug: 'card-lost-or-stolen',
    question: 'What should I do if I lose my card?',
    answer:
      'Freeze it in the app straight away. Freezing is instant and completely reversible, so there is nothing to lose by doing it before you have finished looking. If the card is gone for good, report it in the app or call us on 0800 019 4400 and we will cancel it and send a replacement. Direct Debits and standing orders are unaffected — they do not run on your card.',
    category: 'Cards',
  },
  {
    slug: 'is-my-money-protected',
    question: 'Is my money protected?',
    answer:
      'Yes. Eligible deposits with Reliance Bank are protected up to £85,000 per depositor by the Financial Services Compensation Scheme. If you hold more than that across accounts in the same banking licence, only the first £85,000 is covered. Joint accounts are covered up to £85,000 per account holder.',
    category: 'Security',
  },
  {
    slug: 'how-do-i-know-its-you',
    question: 'How do I know a message is really from you?',
    answer:
      'We will never ask you for your full password, your PIN, or a one-time code — not by phone, not by text, not by email. We will never ask you to move money to a "safe account"; no bank ever will, and anyone who does is committing fraud. If you are unsure, hang up and call us on the number printed on your card.',
    category: 'Security',
  },
  {
    slug: 'unrecognised-payment',
    question: 'There is a payment I do not recognise. What now?',
    answer:
      'Report it in the app under the transaction, or call us. If the payment was not authorised by you, we will refund it and investigate. For a card payment where the goods never arrived or were not as described, we can raise a dispute with the merchant and put the money back into your account provisionally while we look into it.',
    category: 'Payments',
  },
  {
    slug: 'payment-timing',
    question: 'How long does a payment take?',
    answer:
      'Payments to another UK account usually arrive within seconds and always on the same day. A payment to a new payee may be held briefly for a security check the first time. International payments take one to three working days depending on the country.',
    category: 'Payments',
  },
  {
    slug: 'change-of-address',
    question: 'How do I change my address?',
    answer:
      'In the app, under Profile. We will email both your old and your new address to confirm — that is deliberate, so a change made without your knowledge cannot go unnoticed. Statements and cards go to the new address from the moment it is confirmed.',
    category: 'Managing your account',
  },
  {
    slug: 'switching',
    question: 'Can I switch my current account to you?',
    answer:
      'Yes, through the Current Account Switch Service. It takes seven working days, moves your balance, Direct Debits and standing orders, redirects payments from your old account for at least three years, and is covered by the Current Account Switch Guarantee.',
    category: 'Opening an account',
  },
  {
    slug: 'struggling-to-pay',
    question: 'I am struggling to keep up with repayments. What can you do?',
    answer:
      'Tell us early — that is the single thing that most changes the outcome. Depending on your circumstances we can change your payment date, reduce payments for a period, or pause them. Free, independent advice is also available from StepChange, National Debtline and Citizens Advice, and speaking to them does not affect how we treat you.',
    category: 'Borrowing',
  },
  {
    slug: 'complaints',
    question: 'How do I complain?',
    answer:
      'Tell us in the app, by email, or on 0800 019 4400. We aim to resolve complaints within three working days and will always write to you with our final response within eight weeks. If you are unhappy with that response you can refer the complaint to the Financial Ombudsman Service free of charge within six months.',
    category: 'Managing your account',
  },
  {
    slug: 'closing-an-account',
    question: 'How do I close my account?',
    answer:
      'In the app, under Profile, or by calling us. There is no charge and no notice period on a current account or an easy access saver. We will move any remaining balance to an account you nominate. You can download your statements for another 30 days afterwards, and request them from us for six years.',
    category: 'Managing your account',
  },
]);

const LEGAL_DOCUMENTS: readonly CatalogueEntry[] = Object.freeze([
  {
    kind: ContentKind.LEGAL,
    slug: 'terms',
    title: 'Personal banking terms and conditions',
    order: 1,
    seo: seo(
      'Terms and conditions | Reliance Bank',
      'The agreement between you and Reliance Bank for personal current and savings accounts.',
    ),
    payload: {
      version: '2026-03',
      effectiveFrom: '2026-03-01',
      summary:
        'These terms cover your current account, savings accounts and debit card. We give you two months notice before making a change that is to your disadvantage, and you may close your account without charge at any point before it takes effect.',
    },
  },
  {
    kind: ContentKind.LEGAL,
    slug: 'privacy',
    title: 'Privacy notice',
    order: 2,
    seo: seo(
      'Privacy notice | Reliance Bank',
      'What personal information Reliance Bank holds, why we hold it, and the rights you have over it.',
    ),
    payload: {
      version: '2026-03',
      effectiveFrom: '2026-03-01',
      summary:
        'We hold your information to run your account, to meet the legal obligations every bank has, and to detect fraud. You can ask us for a copy of what we hold, ask us to correct it, and object to how we use it.',
    },
  },
  {
    kind: ContentKind.LEGAL,
    slug: 'complaints-policy',
    title: 'How we handle complaints',
    order: 3,
    seo: seo(
      'Complaints | Reliance Bank',
      'How to complain to Reliance Bank, how long it takes, and what to do if you are not satisfied.',
    ),
    payload: {
      version: '2026-03',
      effectiveFrom: '2026-03-01',
      summary:
        'We aim to resolve complaints within three working days and always issue a final response within eight weeks. You may then refer the complaint to the Financial Ombudsman Service free of charge.',
    },
  },
]);

export const HELP_CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  ...FAQS.map((faq, index) => ({
    kind: ContentKind.FAQ,
    slug: faq.slug,
    title: faq.question,
    order: index,
    tags: [faq.category.toLowerCase()],
    payload: { answer: faq.answer, category: faq.category, helpfulCount: 0 },
  })),
  ...LEGAL_DOCUMENTS,
]);
