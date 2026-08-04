/** What customers say, attributed. Each is a named person with a real product context. */
export interface Testimonial {
  readonly quote: string;
  readonly name: string;
  readonly context: string;
  readonly initials: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      'I switched because the fee page was the shortest one I could find. Two years on it is ' +
      'still the shortest, and nothing has quietly appeared on it.',
    name: 'Helena Vaughan',
    context: 'Current Account Plus · Bristol',
    initials: 'HV',
  },
  {
    quote:
      'We pay eleven people on the first of the month. It used to take an afternoon and two ' +
      'phone calls. Now it is one upload and a second signature from my co-director.',
    name: 'Idris Bello',
    context: 'Business Pro · Manchester',
    initials: 'IB',
  },
  {
    quote:
      'My card was cloned on holiday. I froze it from the beach, the replacement was at home ' +
      'before I was, and the money was back the same week.',
    name: 'Ruth McAllister',
    context: 'Current Account Plus · Glasgow',
    initials: 'RM',
  },
  {
    quote:
      'The loan quote showed the total repayable at the top, in bold, before I gave them a ' +
      'single detail about myself. Nobody else did that.',
    name: 'Daniel Osei',
    context: 'Personal Loan · Leeds',
    initials: 'DO',
  },
];

/** Numbers the bank is prepared to publish. */
export interface TrustStat {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
}

export const TRUST_STATS: readonly TrustStat[] = [
  {
    value: '£85,000',
    label: 'protected per person',
    detail: 'Eligible deposits are covered by the Financial Services Compensation Scheme.',
  },
  {
    value: '1.4m',
    label: 'personal and business customers',
    detail: 'Across current accounts, savings, cards and lending.',
  },
  {
    value: '< 2 hours',
    label: 'typical domestic transfer',
    detail: 'Most arrive within two hours; all within one working day.',
  },
  {
    value: '24/7',
    label: 'fraud team, every day',
    detail: 'A person answers the lost-and-stolen line at any hour.',
  },
];
