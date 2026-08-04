import type { SiteHref } from '@/lib/routes';

/** A shortcut into the part of the site that answers a whole class of question. */
export interface HelpTopic {
  readonly title: string;
  readonly description: string;
  readonly href: SiteHref;
}

export const HELP_TOPICS = [
  {
    title: 'Opening an account',
    description:
      'What identification you need, how long it takes, and what happens if we ask for more.',
    href: '/open-an-account',
  },
  {
    title: 'Cards and payments',
    description: 'Freezing a card, changing a limit, pending amounts, and spending abroad.',
    href: '/personal/cards',
  },
  {
    title: 'Rates, fees and limits',
    description: 'Every rate we pay, every charge we make, and the caps on what you can move.',
    href: '/rates-and-fees',
  },
  {
    title: 'Fraud and security',
    description:
      'What we will never ask for, what to do if you have paid a fraudster, and how to report it.',
    href: '/security/fraud',
  },
  {
    title: 'Branches and cash machines',
    description: 'Opening hours, services and step-free access, searchable by town or postcode.',
    href: '/branches',
  },
  {
    title: 'Business banking',
    description: 'Users and roles, approval thresholds, payroll runs and invoice settlement.',
    href: '/business',
  },
] as const satisfies readonly HelpTopic[];

/** Contact routes, in the order most people should try them. */
export const CONTACT_ROUTES = [
  {
    title: 'Message us in the app',
    detail: 'The fastest route. We reply within a working day, and the thread keeps its history.',
    action: 'Open the app',
  },
  {
    title: 'Call us',
    detail: '020 7946 0100, seven days a week, 7am to 11pm. The lost-and-stolen line never closes.',
    action: 'Call 020 7946 0100',
  },
  {
    title: 'Visit a branch',
    detail: 'For anything that needs a signature, a document check or simply a conversation.',
    action: 'Find a branch',
  },
] as const;
