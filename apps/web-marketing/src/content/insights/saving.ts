import type { InsightArticle } from './types';

/** Articles in the Saving section. */
export const SAVING_ARTICLES: readonly InsightArticle[] = [
  {
    slug: 'emergency-fund-that-actually-lasts',
    title: 'How to build an emergency fund that actually lasts',
    excerpt:
      'Most emergency funds fail for the same three reasons. Here is how to build one that ' +
      'survives its first real emergency.',
    category: 'Saving',
    author: { name: 'Ada Okonjo', role: 'Head of Savings' },
    publishedAt: '2026-06-18',
    readingMinutes: 6,
    tags: ['emergency fund', 'budgeting', 'easy access'],
    body: [
      {
        kind: 'paragraph',
        text:
          'An emergency fund is the least interesting thing you will ever save for, and the one ' +
          'that changes the most. It is what turns a broken boiler from a debt into an errand. ' +
          'Nearly everyone who tries to build one gets it right in principle and wrong in one of ' +
          'three specific ways.',
      },
      { kind: 'heading', text: 'Pick a number you can actually reach' },
      {
        kind: 'paragraph',
        text:
          'The usual advice is three to six months of expenses. For most people starting out, ' +
          'that number is so far away it stops being motivating and starts being a reason not to ' +
          'begin. Set the first target at one month of essential outgoings — rent or mortgage, ' +
          'utilities, food, transport, minimum debt payments. Nothing else.',
      },
      {
        kind: 'paragraph',
        text:
          'Reaching a real target once teaches you that you can do it. That matters more than the ' +
          'size of the target. Once the first month is banked, raise the goal by one month at a ' +
          'time and leave the standing order exactly where it is.',
      },
      { kind: 'heading', text: 'Keep it separate, but not too separate' },
      {
        kind: 'paragraph',
        text:
          'A fund held in your current account is not a fund, it is a slightly larger balance, and ' +
          'it will be spent. A fund locked into a fixed-term product is not an emergency fund ' +
          'either — an emergency that has to wait ninety days for the money is not an emergency ' +
          'you were prepared for.',
      },
      {
        kind: 'paragraph',
        text:
          'What you want is an easy-access savings account: interest paid monthly, withdrawals ' +
          'the same day, and a balance you have to make a deliberate decision to touch. The ' +
          'friction of one extra tap is the whole point.',
      },
      {
        kind: 'callout',
        title: 'Automate the transfer, not the decision',
        text:
          'Set a standing order for the day after payday. Money that has never sat in the current ' +
          'account is money you never had to decide against spending.',
      },
      { kind: 'heading', text: 'Decide in advance what counts' },
      {
        kind: 'paragraph',
        text:
          'The third failure is the quiet one. Six months in, the fund is healthy, a holiday comes ' +
          'up, and the fund becomes a holiday fund. Write down what an emergency is before you ' +
          'need one. A short list works:',
      },
      {
        kind: 'list',
        items: [
          'You lose income you were relying on.',
          'Something you need in order to live or work has broken.',
          'A medical, dental or veterinary cost you cannot defer.',
          'Travel you would regret not making.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Everything else gets its own pot. Naming a separate goal for the holiday is not a ' +
          'trick you play on yourself — it is the difference between spending money you planned ' +
          'to spend and spending money you promised yourself you would not.',
      },
      { kind: 'heading', text: 'What good looks like after a year' },
      {
        kind: 'steps',
        items: [
          'One month of essentials, held in easy access, reached in the first three to six months.',
          'A standing order you have not had to think about since the day you set it.',
          'A written definition of an emergency that you have used at least once to say no.',
          'A second, separate pot for the things you are genuinely saving towards.',
        ],
      },
    ],
  },
  {
    slug: 'saving-for-a-house-deposit',
    title: 'Saving for a house deposit when rates are high',
    excerpt:
      'High rates cut both ways. What they mean for a deposit you are still building, and how ' +
      'to think about the trade-off between saving longer and buying sooner.',
    category: 'Saving',
    author: { name: 'Marcus Bell', role: 'Mortgage Product Lead' },
    publishedAt: '2026-05-02',
    readingMinutes: 7,
    tags: ['deposit', 'mortgages', 'interest rates'],
    body: [
      {
        kind: 'paragraph',
        text:
          'When mortgage rates rise, the instinct is to hurry — to buy before they go higher. It ' +
          'is worth sitting with the arithmetic for a moment, because a higher rate environment ' +
          'changes both sides of the equation, and only one of them is bad news.',
      },
      { kind: 'heading', text: 'Your deposit is earning too' },
      {
        kind: 'paragraph',
        text:
          'The same conditions that make borrowing expensive make saving productive. A deposit ' +
          'sitting in a well-priced easy-access account is compounding at a rate that would have ' +
          'looked generous a few years ago. Six more months of saving is not six months lost.',
      },
      {
        kind: 'paragraph',
        text:
          'It also moves you between loan-to-value bands, and that is where the real money is. ' +
          'Crossing from a 90% loan-to-value to 85% typically moves you onto a materially better ' +
          'rate — often worth more over a five-year fix than the extra saved.',
      },
      { kind: 'heading', text: 'Work out your next band, not your target' },
      {
        kind: 'paragraph',
        text:
          'Instead of aiming at an abstract deposit figure, find the price of the homes you are ' +
          'actually looking at and calculate the deposit that puts you in the next band down. ' +
          'That is a concrete number, usually closer than the one in your head, and it comes with ' +
          'a measurable reward attached.',
      },
      {
        kind: 'callout',
        title: 'A decision in principle costs nothing and expires',
        text:
          'It is a soft check that leaves no mark on your credit file. Get one when you are ' +
          'within three months of looking seriously — not before, because it will lapse.',
      },
      { kind: 'heading', text: 'Where to hold the money' },
      {
        kind: 'list',
        items: [
          'Money you might need within twelve months belongs in easy access. A fixed term you have to break is a fixed term that has cost you.',
          'Money you are certain is untouched for a year or more can go into a fixed-term deposit at a higher rate.',
          'Split the deposit across both if the completion date is uncertain — most are.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Whatever you choose, keep the deposit out of anything whose value can fall. A deposit ' +
          'is not a long-term investment; it is a payment with a date on it.',
      },
      { kind: 'heading', text: 'The honest trade-off' },
      {
        kind: 'paragraph',
        text:
          'Waiting is not free. Rent is not building equity, prices may move, and life does not ' +
          'pause for an optimal loan-to-value. The point is not that waiting always wins — it is ' +
          'that hurrying is a decision too, and it deserves the same arithmetic.',
      },
    ],
  },
];
