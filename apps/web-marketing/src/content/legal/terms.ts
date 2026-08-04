import type { Prose } from '../prose';

/** The account terms, in the language of the product rather than of a contract. */
export const TERMS: Prose = [
  {
    kind: 'paragraph',
    text:
      'These terms govern your Reliance Bank accounts, cards and payment services. They are ' +
      'written to be read. Where a phrase has a specific legal meaning we say so, and where a ' +
      'rule costs you money we say that too.',
  },
  { kind: 'heading', text: '1. Who we are' },
  {
    kind: 'paragraph',
    text:
      'Reliance Bank plc is registered in England and Wales, company number 09482173, with its ' +
      'registered office at 1 Foundry Square, London EC2A 4RQ. We are authorised by the Prudential ' +
      'Regulation Authority and regulated by the Financial Conduct Authority and the Prudential ' +
      'Regulation Authority.',
  },
  { kind: 'heading', text: '2. Opening an account' },
  {
    kind: 'paragraph',
    text:
      'To open an account you must be at least 18, resident in the United Kingdom, and able to ' +
      'satisfy our identity checks. We may decline an application and we are not always able to ' +
      'tell you why — sometimes the law prevents it.',
  },
  {
    kind: 'paragraph',
    text:
      'You must give us accurate information and tell us within 30 days if your name, address, ' +
      'phone number or tax residency changes. We rely on those details to reach you about your ' +
      'money.',
  },
  { kind: 'heading', text: '3. Using your account' },
  {
    kind: 'list',
    items: [
      'You are responsible for keeping your passcode, card PIN and devices secure. Never share them, including with us.',
      'You must not use the account for anything unlawful, or on behalf of someone else without telling us.',
      'A payment instruction is treated as authorised once you have confirmed it using your security credentials.',
      'You can cancel a future-dated or recurring payment up to the end of the working day before it is due.',
    ],
  },
  { kind: 'heading', text: '4. Payments' },
  {
    kind: 'paragraph',
    text:
      'Most domestic payments arrive within two hours and all within one working day. Payments ' +
      'instructed after our cut-off time, or on a non-working day, are processed on the next ' +
      'working day. Cut-off times are published in the app and on the rates and fees page.',
  },
  {
    kind: 'paragraph',
    text:
      'We may refuse a payment where we reasonably suspect fraud, where it would breach a limit, ' +
      'where there is not enough available balance, or where the law requires it. We will tell you ' +
      'and why, unless telling you would itself be unlawful.',
  },
  { kind: 'heading', text: '5. Charges and interest' },
  {
    kind: 'paragraph',
    text:
      'Every charge that can apply to your account is published on the rates and fees page. We ' +
      'give you at least 60 days’ notice before introducing a new charge or increasing an existing ' +
      'one, and at least 14 days’ notice before reducing a credit interest rate. Increases to a ' +
      'credit interest rate take effect immediately.',
  },
  {
    kind: 'callout',
    title: 'You can always leave',
    text:
      'If you do not accept a change, you may close your account at any time before it takes ' +
      'effect, free of charge, and we will return your balance.',
  },
  { kind: 'heading', text: '6. Overdrafts' },
  {
    kind: 'paragraph',
    text:
      'An arranged overdraft is a credit facility repayable on demand. Interest is calculated ' +
      'daily on the balance above the interest-free buffer and charged monthly, subject to the ' +
      'monthly cap published on the overdraft page. We price arranged and unarranged borrowing ' +
      'identically and charge no separate fee for either.',
  },
  { kind: 'heading', text: '7. If something goes wrong' },
  {
    kind: 'paragraph',
    text:
      'Tell us as soon as you can. Where a payment was not authorised by you, we will refund it — ' +
      'and we investigate afterwards, not before. We may not refund where you have acted ' +
      'fraudulently, or with gross negligence such as sharing a passcode after we have warned you ' +
      'not to.',
  },
  {
    kind: 'paragraph',
    text:
      'You have the right to complain, free of charge. We acknowledge complaints within three ' +
      'working days. If you are unhappy with our final response, or eight weeks pass without one, ' +
      'you may refer the matter to the Financial Ombudsman Service.',
  },
  { kind: 'heading', text: '8. Closing an account' },
  {
    kind: 'paragraph',
    text:
      'You may close any account at any time, at no cost, and we will return the balance to a ' +
      'nominated account. We may close an account by giving you at least two months’ notice, or ' +
      'immediately where we are required to by law or where the account has been used for fraud.',
  },
  { kind: 'heading', text: '9. Deposit protection' },
  {
    kind: 'paragraph',
    text:
      'Eligible deposits are protected up to £85,000 per person by the Financial Services ' +
      'Compensation Scheme. The limit applies to the total you hold with us, across all accounts, ' +
      'not to each account separately. A full information sheet is provided when you open an ' +
      'account and annually thereafter.',
  },
  { kind: 'heading', text: '10. Law' },
  {
    kind: 'paragraph',
    text:
      'These terms are governed by the law of England and Wales, and the courts of England and ' +
      'Wales have jurisdiction. If you live in Scotland or Northern Ireland you may also bring ' +
      'proceedings in your own courts.',
  },
];
