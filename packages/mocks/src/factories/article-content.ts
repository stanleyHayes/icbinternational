/**
 * Real article copy for the generated insights feed.
 *
 * These bodies replace `faker.lorem.paragraphs()`. Latin filler is banned outright by
 * `agent_plan.md` §4.6 — but the stronger reason is that it made the marketing site
 * useless as a preview of itself. Nobody can judge whether an article layout works when
 * every paragraph is the same length and says nothing, and a reviewer skims past
 * "dolor sit amet" without noticing the typography is wrong.
 *
 * Four articles, keyed by title so a slug is stable across runs. Each is genuine, useful
 * financial guidance of the kind a bank actually publishes.
 */

export interface ArticleContent {
  readonly title: string;
  readonly excerpt: string;
  readonly body: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly readingMinutes: number;
}

export const ARTICLES: readonly ArticleContent[] = Object.freeze([
  {
    title: 'How to build an emergency fund that actually lasts',
    excerpt:
      'Three months of outgoings is the usual advice. Here is how to work out your own number, and where to keep it so you are not tempted.',
    category: 'Saving',
    tags: ['saving', 'budgeting'],
    readingMinutes: 6,
    body: `Most guidance says three to six months of expenses. That range is so wide it is nearly
useless, because it is answering the wrong question. What matters is how long it would take you to
replace your income, and that depends on your work, not on a rule of thumb.

Start with your outgoings rather than your salary. Add up only what you could not stop paying next
month: rent or mortgage, utilities, food, transport, insurance, minimum debt payments. Leave out
everything discretionary. That figure is one month of survival, and it is usually a good deal
smaller than people expect.

Then set the multiple. If you are on a permanent contract in a field that hires steadily, three
months is defensible. If your income is irregular, seasonal, or concentrated with one client, six
is closer to honest. If you are the only earner in the household, add a month.

Keep it somewhere you will not spend it by accident, but can reach within a day. A separate savings
account with its own name works better than willpower — money labelled "Emergency fund" is
noticeably harder to raid than the same money sitting in your current account.

Build it before you overpay debt, with one exception: anything above roughly 20% APR is costing you
more than the fund protects you from, so clear that first. Below that, the fund wins, because the
whole point is to avoid borrowing at a bad rate under pressure.

Finally, decide in advance what counts as an emergency. A boiler is. A holiday is not. Writing it
down while you are calm is the cheapest financial planning there is.`,
  },
  {
    title: 'Understanding APR: what the number really means',
    excerpt:
      'APR is not the interest rate. Knowing the difference is the difference between comparing two loans and guessing between them.',
    category: 'Borrowing',
    tags: ['borrowing', 'rates'],
    readingMinutes: 5,
    body: `The interest rate is what the lender charges on the balance. The APR — annual percentage
rate — is the interest plus the compulsory fees, expressed as one yearly figure. It exists so two
loans with different fee structures can be compared with a single number.

That is why a loan advertising 6.9% interest and a £200 arrangement fee has an APR above 6.9%. The
fee is real money and the APR is obliged to say so.

"Representative APR" means something narrower again: at least 51% of people accepted got that rate
or better. It is not a quote. Just under half of successful applicants can be offered more, and
that is entirely within the rules.

Two further traps. APR assumes you run the loan to term — settle early and the effective cost
changes, usually in your favour, though an early repayment charge can claw some of it back. And APR
on a variable-rate product is a snapshot: it describes today's rate, not the one you will be paying
in three years.

For a like-for-like comparison, ignore the monthly payment and look at the total amount repayable.
It is the one number that cannot be made to flatter a loan by stretching the term.`,
  },
  {
    title: 'Five signs a payment request is a scam',
    excerpt:
      'Authorised push payment fraud works by rushing you. Every sign below is a reason to stop and check through a number you already had.',
    category: 'Security',
    tags: ['security', 'fraud'],
    readingMinutes: 4,
    body: `**Urgency.** Your account is compromised, the payment must go today, the offer expires in
an hour. Pressure is the tool, because a person given ten minutes to think usually stops. No
genuine bank, including this one, will ever create that pressure.

**A new account for an existing relationship.** Your builder, solicitor or landlord emails to say
their bank details have changed. This is the single most expensive scam in the country. Ring them
on the number you already had — never the one in the email — and confirm.

**Being asked to move money "to keep it safe".** No bank has a safe account. If someone claiming to
be from your bank, the police or a fraud team asks you to transfer money anywhere, the call is
fraudulent no matter how much they know about you.

**Secrecy.** You are told not to discuss it with branch staff, family, or anyone else, often framed
as an internal investigation. Real investigations do not need you to keep them secret from your own
bank.

**A name that does not quite match.** When you set up a payment we check the name against the
receiving account and tell you if it does not match. Treat a mismatch as a stop, not a formality —
it is the last automated check before the money is gone.

If you have already paid, contact us immediately. Speed matters more than anything else in
recovery, and there is nothing to be embarrassed about: these schemes are designed by people who do
this full time.`,
  },
  {
    title: 'Saving for a house deposit in a high-rate market',
    excerpt:
      'Higher rates cut what you can borrow and raise what your savings earn. Both change the arithmetic of when to buy.',
    category: 'Saving',
    tags: ['saving', 'mortgages'],
    readingMinutes: 7,
    body: `When rates rise, two things move at once and they pull in opposite directions. What a
lender will advance you falls, because affordability is tested against the payment rather than the
loan. And what your deposit earns while it waits rises, sometimes sharply.

The result is that saving longer is worth more than it used to be, and stretching to buy now is
worth less. That is a genuine change, not a slogan — but it only holds while rates stay high, and
nobody reliably knows how long that is.

Where to keep it depends entirely on timing. Under two years away, take the certainty: a savings
account or a fixed-term deposit, with the money intact and the return known. Beyond five years, the
usual arguments for investing apply. Between the two is a judgement call, and the deciding question
is whether a 20% fall a month before completion would be survivable.

Watch the loan-to-value thresholds rather than a round-number target. Rates step at 95%, 90%, 85%
and 75%, and the jump between bands is often larger than a year of saving. Getting from 89% to 85%
can be worth more than getting from 85% to 80%.

Do not forget the costs beyond the deposit: legal fees, survey, stamp duty where it applies, and
moving itself. Budgeting for the deposit alone is the most common reason a purchase stalls in its
final fortnight.`,
  },
]);
