import type { Prose } from '../prose';

/** The privacy notice. */
export const PRIVACY: Prose = [
  {
    kind: 'paragraph',
    text:
      'This notice explains what personal information Reliance Bank plc holds about you, why we ' +
      'hold it, who we share it with and what you can ask us to do about it. We are the data ' +
      'controller for everything described here.',
  },
  { kind: 'heading', text: 'What we collect' },
  {
    kind: 'list',
    items: [
      'Identity and contact details: name, date of birth, address, email, phone number, and the identity documents you give us.',
      'Financial information: balances, transactions, payees, income and, where you borrow, affordability and credit-reference data.',
      'Technical information: the devices and browsers you use, IP addresses, and the security keys registered to your account.',
      'Interactions: messages, calls (which are recorded), branch visits and complaints.',
    ],
  },
  { kind: 'heading', text: 'Why we hold it' },
  {
    kind: 'paragraph',
    text:
      'To run your account and make the payments you instruct — that is the performance of our ' +
      'contract with you. To meet legal obligations on identification, sanctions screening, ' +
      'financial crime and tax reporting. And, on the basis of our legitimate interests, to detect ' +
      'fraud, to keep the service secure and to improve it.',
  },
  {
    kind: 'paragraph',
    text:
      'We use your consent only for optional things, such as marketing email. Withdrawing consent ' +
      'is one click and never affects your account.',
  },
  { kind: 'heading', text: 'Automated decisions' },
  {
    kind: 'paragraph',
    text:
      'Some decisions are made automatically: whether a payment looks like fraud, and whether a ' +
      'loan application meets our lending criteria. You have the right to ask for a human review ' +
      'of any automated decision that affects you, to be told the main factors behind it, and to ' +
      'contest it.',
  },
  { kind: 'heading', text: 'Who we share it with' },
  {
    kind: 'list',
    items: [
      'Payment schemes and other banks, to the extent needed to move a payment you instructed.',
      'Credit reference and fraud prevention agencies, which may keep a record of the search.',
      'Regulators, law enforcement and tax authorities, where we are legally required to.',
      'Suppliers who process data on our behalf under contract, and only on our instructions.',
    ],
  },
  {
    kind: 'callout',
    title: 'We do not sell your data',
    text:
      'Not to advertisers, not to data brokers, not to anyone. It is not a source of revenue for ' +
      'this bank and it never will be.',
  },
  { kind: 'heading', text: 'How long we keep it' },
  {
    kind: 'paragraph',
    text:
      'For as long as you are a customer, and then for six years after the relationship ends — the ' +
      'period the law requires for financial records. Some records, such as those relating to a ' +
      'financial crime investigation, are kept longer where we are required to.',
  },
  { kind: 'heading', text: 'Your rights' },
  {
    kind: 'list',
    items: [
      'Ask for a copy of the personal data we hold, free of charge, within one month.',
      'Ask us to correct anything inaccurate.',
      'Ask us to delete data we no longer have a lawful reason to keep.',
      'Object to processing based on our legitimate interests, including profiling.',
      'Ask for your data in a portable, machine-readable format.',
      'Complain to the Information Commissioner’s Office, though we would rather you told us first.',
    ],
  },
  { kind: 'heading', text: 'Contacting our Data Protection Officer' },
  {
    kind: 'paragraph',
    text:
      'Write to the Data Protection Officer, Reliance Bank plc, 1 Foundry Square, London EC2A 4RQ, ' +
      'or email privacy@reliancebank.example. We reply within one month.',
  },
];
