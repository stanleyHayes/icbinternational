/** An open role. */
export interface Vacancy {
  readonly title: string;
  readonly team: string;
  readonly location: string;
  readonly arrangement: 'Hybrid' | 'Remote' | 'On site';
  readonly summary: string;
}

/** Currently advertised roles. */
export const VACANCIES: readonly Vacancy[] = [
  {
    title: 'Senior Backend Engineer, Ledger',
    team: 'Core Banking',
    location: 'London',
    arrangement: 'Hybrid',
    summary:
      'Work on the double-entry ledger every balance in the bank is derived from. Strong opinions ' +
      'about correctness under concurrency are the job description.',
  },
  {
    title: 'Financial Crime Analyst',
    team: 'Financial Crime',
    location: 'Manchester',
    arrangement: 'Hybrid',
    summary:
      'Investigate alerts, tune the rules that raise them, and help customers who have been ' +
      'targeted. Two years in a regulated firm, or a very good reason why not.',
  },
  {
    title: 'Product Designer, Payments',
    team: 'Design',
    location: 'London',
    arrangement: 'Hybrid',
    summary:
      'Design the moment somebody sends money to a person they have never paid before. It is the ' +
      'highest-stakes screen in the product and it should not feel like it.',
  },
  {
    title: 'Customer Support Specialist',
    team: 'Customer Operations',
    location: 'Glasgow',
    arrangement: 'On site',
    summary:
      'Answer calls and messages from customers, with the authority to actually fix things. No ' +
      'scripts, no average-handling-time target.',
  },
  {
    title: 'Credit Risk Manager',
    team: 'Risk',
    location: 'London',
    arrangement: 'Hybrid',
    summary:
      'Own the affordability and scoring models behind personal lending, and the argument for why ' +
      'each cut-off sits where it does.',
  },
  {
    title: 'Accessibility Engineer',
    team: 'Design Systems',
    location: 'Remote',
    arrangement: 'Remote',
    summary:
      'Hold the whole product to WCAG 2.2 AA and past it. People move money with screen readers; ' +
      'this role exists because that has to work.',
  },
];

/** What the bank offers, stated as facts rather than adjectives. */
export const BENEFITS: readonly { readonly title: string; readonly text: string }[] = [
  {
    title: 'Salary bands are published internally',
    text: 'Every role sits in a band, every band is visible to every employee, and we do not negotiate individually.',
  },
  {
    title: 'Thirty days of leave, plus public holidays',
    text: 'And a minimum, not a maximum: we track that people take it, and managers are measured on whether their team does.',
  },
  {
    title: 'Six months of parental leave at full pay',
    text: 'For any parent, however the child arrived, from the first day of employment.',
  },
  {
    title: 'Hybrid means two days, not a rota',
    text: 'Two days a week in an office for most roles, chosen by the team rather than assigned centrally.',
  },
  {
    title: 'A learning budget you do not have to justify',
    text: '£1,500 a year for courses, conferences or books. No approval chain under that figure.',
  },
  {
    title: 'Pension matched to 8%',
    text: 'From day one, with no waiting period and no requirement to contribute a matching amount yourself.',
  },
];
