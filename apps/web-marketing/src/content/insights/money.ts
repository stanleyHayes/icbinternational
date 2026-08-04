import type { InsightArticle } from './types';

/** Articles in the Borrowing and Everyday money sections. */
export const MONEY_ARTICLES: readonly InsightArticle[] = [
  {
    slug: 'understanding-apr',
    title: 'Understanding APR: what the number really means',
    excerpt:
      'APR is not the interest rate. Knowing the difference is what lets you compare two loans ' +
      'that look nothing alike.',
    category: 'Borrowing',
    author: { name: 'Marcus Bell', role: 'Mortgage Product Lead' },
    publishedAt: '2026-06-30',
    readingMinutes: 5,
    tags: ['apr', 'loans', 'comparison'],
    body: [
      {
        kind: 'paragraph',
        text:
          'Two lenders quote you 7.9%. One charges a £199 arrangement fee, the other does not. ' +
          'They are not the same loan, and the interest rate will not tell you that. APR will.',
      },
      { kind: 'heading', text: 'Interest rate versus APR' },
      {
        kind: 'paragraph',
        text:
          'The interest rate is the cost of the money. The annual percentage rate is the cost of ' +
          'the whole arrangement — interest plus any compulsory fees — expressed as a single ' +
          'yearly figure. It exists precisely so that two products with different fee structures ' +
          'can be put side by side.',
      },
      {
        kind: 'callout',
        title: 'Representative APR is not your APR',
        text:
          '"Representative" means at least 51% of accepted applicants get that rate or better. ' +
          'The other 49% are offered something higher. Your own rate depends on your ' +
          'circumstances and is quoted before you commit to anything.',
      },
      { kind: 'heading', text: 'Where APR is less useful' },
      {
        kind: 'list',
        items: [
          'On a mortgage, the headline is usually the initial fixed rate; APRC assumes you stay on the lender’s variable rate for the whole term, which almost nobody does.',
          'On a credit card, APR assumes a constant balance, which is not how most people use one.',
          'On a very short loan, a modest flat fee produces an enormous APR that is technically correct and practically misleading.',
        ],
      },
      { kind: 'heading', text: 'The number that actually settles it' },
      {
        kind: 'paragraph',
        text:
          'Total amount repayable. It folds in the rate, the fees and the term in pounds rather ' +
          'than percentages, and it is the figure that comes out of your account. Every quote we ' +
          'give shows it before you apply.',
      },
      {
        kind: 'paragraph',
        text:
          'Watch what happens when you lengthen the term. A longer loan almost always has a lower ' +
          'monthly payment and a higher total cost. Both are true, and which matters more depends ' +
          'entirely on your circumstances — but you should be choosing, not discovering.',
      },
    ],
  },
  {
    slug: 'what-happens-when-you-tap-a-card',
    title: 'What actually happens in the two seconds after you tap a card',
    excerpt:
      'Authorisation, capture, settlement and the pending amount that does not match your ' +
      'receipt. A short tour of the plumbing.',
    category: 'Everyday money',
    author: { name: 'Ada Okonjo', role: 'Head of Savings' },
    publishedAt: '2026-03-21',
    readingMinutes: 6,
    tags: ['cards', 'payments', 'pending'],
    body: [
      {
        kind: 'paragraph',
        text:
          'You tap, the terminal beeps, your phone buzzes. Between those two things sits a chain ' +
          'of messages that explains almost every card question we are ever asked — including why ' +
          'a payment can be pending for days, and why the amount sometimes changes.',
      },
      { kind: 'heading', text: 'Authorisation: a question, not a payment' },
      {
        kind: 'paragraph',
        text:
          'The terminal asks whether the money is there and whether the card is allowed to spend ' +
          'it. We check the available balance, the limits you have set, and our fraud rules, and ' +
          'we answer within a couple of hundred milliseconds. If the answer is yes, we place a ' +
          'hold on that amount.',
      },
      {
        kind: 'paragraph',
        text:
          'A hold is not a payment. Your ledger balance has not changed. Your available balance ' +
          'has, which is why the two figures can differ.',
      },
      { kind: 'heading', text: 'Capture: the merchant claims it' },
      {
        kind: 'paragraph',
        text:
          'The merchant later tells the network what to actually collect. For a shop that is ' +
          'usually the same evening and the same amount. For a hotel, a car hire firm or a fuel ' +
          'pump it might be days later, and it might differ from the authorisation.',
      },
      {
        kind: 'callout',
        title: 'Why a fuel pump reserves more than you spend',
        text:
          'The pump cannot know what you will draw, so it authorises a standard amount and ' +
          'captures the real one. The difference is released, usually within a day or two.',
      },
      { kind: 'heading', text: 'Settlement: the money moves' },
      {
        kind: 'paragraph',
        text:
          'Overnight, the networks net off everything owed between banks and move the funds. This ' +
          'is when the transaction stops being pending and becomes a settled line on your ' +
          'statement, with a final amount.',
      },
      { kind: 'heading', text: 'What to do with the knowledge' },
      {
        kind: 'list',
        items: [
          'A pending amount that does not match your receipt is normal and will correct at settlement.',
          'A hold that has not cleared after seven days has expired on our side; the money is yours again.',
          'A refund is a new transaction travelling in the other direction, not a reversal, which is why it takes as long as a payment.',
          'Freezing your card blocks new authorisations immediately, but does not stop a capture that has already been authorised.',
        ],
      },
    ],
  },
  {
    slug: 'spending-abroad-without-the-surprises',
    title: 'Spending abroad without the surprises',
    excerpt:
      'Dynamic currency conversion, ATM fees and the difference between a card rate and the ' +
      'rate on the board outside the bureau.',
    category: 'Everyday money',
    author: { name: 'Priya Raman', role: 'Head of Financial Crime' },
    publishedAt: '2026-02-11',
    readingMinutes: 4,
    tags: ['travel', 'fx', 'fees'],
    body: [
      {
        kind: 'paragraph',
        text:
          'Most of the cost of spending abroad is not the exchange rate. It is a handful of ' +
          'decisions made at a terminal in a hurry, usually by someone tired at an airport.',
      },
      { kind: 'heading', text: 'Always pay in the local currency' },
      {
        kind: 'paragraph',
        text:
          'When a terminal offers to charge you in pounds, that is dynamic currency conversion. ' +
          'It sounds helpful and is almost always worse — the merchant’s payment provider sets ' +
          'that rate, and it includes a margin you cannot see. Choosing the local currency lets ' +
          'the card network convert instead, at a rate published daily.',
      },
      {
        kind: 'callout',
        title: 'The wording is deliberately reassuring',
        text:
          '"Pay in GBP — no conversion" is not a saving. Pick the local currency every time, and ' +
          'ignore the framing.',
      },
      { kind: 'heading', text: 'Cash costs more than card, nearly everywhere' },
      {
        kind: 'list',
        items: [
          'Independent ATMs, particularly in tourist areas, add their own charge on top of anything your bank levies.',
          'That charge is disclosed on screen. Read it — you can cancel at that point without being charged.',
          'Withdrawing one larger amount beats several small ones when a flat fee applies.',
        ],
      },
      { kind: 'heading', text: 'Before you travel' },
      {
        kind: 'steps',
        items: [
          'Check your card’s international payment setting is on, and turn it off again when you get home.',
          'Set a sensible per-transaction limit for the trip.',
          'Make sure you can receive our messages abroad — a passkey works with no signal at all.',
          'Hold the currency in advance if the trip is planned, so the rate is fixed on a day you chose.',
        ],
      },
    ],
  },
];
