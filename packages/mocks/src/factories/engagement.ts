/**
 * Engagement and content fixtures: notifications, tickets, disputes and CMS entities.
 */

import {
  ChatAuthorType,
  ChatConversationStatus,
  DisputeReason,
  DisputeStatus,
  LocationKind,
  NotificationCategory,
  NotificationSeverity,
  PublishStatus,
  TicketPriority,
  TicketStatus,
  TicketTopic,
  type AdminChatConversation,
  type Article,
  type BankLocation,
  type CmsPage,
  type Dispute,
  type Faq,
  type Notification,
  type NotificationPreferences,
  type Ticket,
} from '@reliance/contracts';

import type { MockClock } from '../db/clock.js';
import { money } from '../db/money.js';
import { faker, mockId, opaqueId, pickOne, postcode, times } from '../faker.js';

import { ARTICLES } from './article-content.js';
import type { FactoryOptions } from './identity.js';
import { BYLINES, UK_BRANCH_LOCATIONS } from './uk-places.js';

/** A notification. */
export function makeNotification(options: FactoryOptions<Notification>): Notification {
  const { clock, overrides } = options;
  const category = pickOne([
    NotificationCategory.TRANSACTION,
    NotificationCategory.SECURITY,
    NotificationCategory.CARD,
    NotificationCategory.SAVINGS,
    NotificationCategory.STATEMENT,
  ]);
  const createdAt = clock.daysAgo(faker.number.int({ min: 0, max: 30 }));

  return {
    id: mockId('ntf'),
    category,
    severity: NotificationSeverity.INFO,
    title: TITLES[category] ?? 'Account update',
    body: BODIES[category] ?? 'Something happened on your account.',
    actionUrl: null,
    actionLabel: null,
    iconKey: category.toLowerCase(),
    read: faker.datatype.boolean(),
    createdAt,
    readAt: null,
    ...overrides,
  };
}

const TITLES: Partial<Record<NotificationCategory, string>> = {
  [NotificationCategory.TRANSACTION]: 'Payment sent',
  [NotificationCategory.SECURITY]: 'New sign-in detected',
  [NotificationCategory.CARD]: 'Card used abroad',
  [NotificationCategory.SAVINGS]: 'Goal milestone reached',
  [NotificationCategory.STATEMENT]: 'Your statement is ready',
};

const BODIES: Partial<Record<NotificationCategory, string>> = {
  [NotificationCategory.TRANSACTION]: 'Your payment has been sent and should arrive shortly.',
  [NotificationCategory.SECURITY]: 'We noticed a sign-in from a device we have not seen before.',
  [NotificationCategory.CARD]: 'Your card was used outside the United Kingdom.',
  [NotificationCategory.SAVINGS]: 'You are halfway to your savings goal. Keep going.',
  [NotificationCategory.STATEMENT]: 'Last month’s statement is now available to download.',
};

/**
 * The default preference matrix.
 *
 * Every channel is on for `SECURITY` and stays on: the contract's `MANDATORY_CATEGORIES`
 * says the customer cannot mute it, and a mock that let them would let a UI ship a
 * toggle the real API rejects.
 */
export function makeNotificationPreferences(): NotificationPreferences {
  const categories = Object.values(NotificationCategory);

  return {
    preferences: categories.map((category) => ({
      category,
      inApp: true,
      email: category !== NotificationCategory.MARKETING,
      sms: category === NotificationCategory.SECURITY,
      push: category !== NotificationCategory.MARKETING,
    })),
    quietHours: { from: '22:00', to: '07:00' },
    timezone: 'Europe/London',
  };
}

/** A support ticket with a short thread on it. */
export function makeTicket(options: FactoryOptions<Ticket> & { customerName: string }): Ticket {
  const { clock, customerName, overrides } = options;
  const createdAt = clock.daysAgo(faker.number.int({ min: 1, max: 40 }));
  const topic = pickOne([TicketTopic.PAYMENTS, TicketTopic.CARDS, TicketTopic.ACCOUNT]);

  return {
    id: mockId('tkt'),
    subject: pickOne([
      'Payment has not arrived',
      'Card declined at a shop',
      'Change my address',
      'Question about my statement',
    ]),
    topic,
    status: TicketStatus.AWAITING_AGENT,
    priority: TicketPriority.NORMAL,
    assignedAgentName: faker.person.fullName(),
    messages: [
      {
        id: opaqueId(),
        authorType: 'CUSTOMER',
        authorName: customerName,
        body: 'Hello, I need some help with this. Could you take a look please?',
        attachmentIds: [],
        sentAt: createdAt,
      },
      {
        id: opaqueId(),
        authorType: 'AGENT',
        authorName: faker.person.firstName(),
        body: 'Thanks for getting in touch — I am looking into this now and will come back to you.',
        attachmentIds: [],
        sentAt: createdAt,
      },
    ],
    unreadCount: 1,
    slaDueAt: clock.daysAhead(1),
    satisfactionRating: null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    ...overrides,
  };
}

/** A live chat conversation with a short thread on it, in the agent-facing shape. */
export function makeChatConversation(
  options: FactoryOptions<AdminChatConversation> & { customerName: string },
): AdminChatConversation {
  const { clock, customerName, overrides } = options;
  const createdAt = clock.daysAgo(faker.number.int({ min: 0, max: 5 }));
  // A conversation opened from the marketing site has a guest behind it, not a customer;
  // the opening message has to agree with that or the inbox shows an impossible thread.
  const guest = overrides?.guest ?? null;

  return {
    id: mockId('cnv'),
    status: ChatConversationStatus.OPEN,
    subject: pickOne([
      'Question about my balance',
      'Card has not arrived yet',
      'Help with a pending payment',
    ]),
    messages: [
      {
        id: mockId('cmsg'),
        authorType: guest ? ChatAuthorType.GUEST : ChatAuthorType.CUSTOMER,
        authorName: guest?.name ?? customerName,
        body: 'Hi — could someone take a look at this for me, please?',
        sentAt: createdAt,
      },
      {
        id: mockId('cmsg'),
        authorType: ChatAuthorType.AGENT,
        authorName: faker.person.firstName(),
        body: 'Of course — give me a moment while I open your account.',
        sentAt: createdAt,
      },
    ],
    unreadCount: 1,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    customerUserId: null,
    guest: null,
    assignedAgentName: faker.person.fullName(),
    agentUnreadCount: 1,
    ...overrides,
  };
}

/** An open dispute against a transaction. */
export function makeDispute(
  options: FactoryOptions<Dispute> & { transactionId: string; amountMinor: bigint },
): Dispute {
  const { amountMinor, clock, overrides, transactionId } = options;
  const createdAt = clock.daysAgo(faker.number.int({ min: 1, max: 20 }));
  const disputed = money(amountMinor);

  return {
    id: mockId('dsp'),
    transactionId,
    status: DisputeStatus.UNDER_REVIEW,
    reason: DisputeReason.GOODS_NOT_RECEIVED,
    description: 'I ordered this item three weeks ago and it has never arrived.',
    disputedAmount: disputed,
    provisionalCredit: disputed,
    provisionalCreditAt: createdAt,
    evidenceIds: [],
    merchantResponse: null,
    outcomeSummary: null,
    timeline: [
      { status: DisputeStatus.SUBMITTED, at: createdAt, detail: 'Dispute raised' },
      { status: DisputeStatus.UNDER_REVIEW, at: createdAt, detail: 'Investigation started' },
    ],
    decisionDueAt: clock.daysAhead(45),
    createdAt,
    resolvedAt: null,
    ...overrides,
  };
}

/** A published marketing page. */
export function makeCmsPage(
  options: FactoryOptions<CmsPage> & { slug: string; title: string },
): CmsPage {
  const { clock, overrides, slug, title } = options;

  return {
    id: opaqueId(),
    slug,
    title,
    status: PublishStatus.PUBLISHED,
    seo: {
      title: `${title} | Reliance Bank`,
      description: `${title} at Reliance Bank — clear pricing, no surprises.`,
      ogImageUrl: null,
      canonicalUrl: null,
      noIndex: false,
    },
    blocks: [
      { id: opaqueId(), type: 'HERO', props: { heading: title, cta: 'Open an account' } },
      { id: opaqueId(), type: 'FEATURE_GRID', props: { columns: 3 } },
      { id: opaqueId(), type: 'FAQ', props: { limit: 6 } },
    ],
    publishedAt: clock.daysAgo(faker.number.int({ min: 5, max: 200 })),
    updatedAt: clock.daysAgo(faker.number.int({ min: 1, max: 30 })),
    ...overrides,
  };
}

/** A published article. */
export function makeArticle(options: FactoryOptions<Article>): Article {
  const { clock, overrides } = options;
  // Real copy, not `faker.lorem`. Latin filler is banned by §4.6, and it also made the
  // insights page impossible to judge: every paragraph the same length, saying nothing.
  const article = faker.helpers.arrayElement([...ARTICLES]);

  return {
    id: opaqueId(),
    slug: article.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    coverImageUrl: null,
    category: article.category,
    tags: [...article.tags],
    authorName: pickOne(BYLINES),
    authorAvatarUrl: null,
    readingMinutes: article.readingMinutes,
    status: PublishStatus.PUBLISHED,
    publishedAt: clock.daysAgo(faker.number.int({ min: 2, max: 300 })),
    ...overrides,
  };
}

/** A published FAQ. */
export function makeFaq(options: { index: number; overrides?: Partial<Faq> }): Faq {
  const entry = FAQ_SEED[options.index % FAQ_SEED.length];

  return {
    id: opaqueId(),
    question: entry?.question ?? 'How do I contact support?',
    answer: entry?.answer ?? 'Message us in the app and an agent will reply.',
    category: entry?.category ?? 'General',
    order: options.index,
    helpfulCount: faker.number.int({ min: 0, max: 400 }),
    ...options.overrides,
  };
}

const FAQ_SEED: readonly { question: string; answer: string; category: string }[] = [
  {
    question: 'How long does a domestic transfer take?',
    answer: 'Most domestic payments arrive within two hours, and always within one working day.',
    category: 'Payments',
  },
  {
    question: 'What should I do if my card is lost?',
    answer: 'Freeze it in the app immediately, then report it so we can send a replacement.',
    category: 'Cards',
  },
  {
    question: 'Is my money protected?',
    answer: 'Eligible deposits are protected up to the statutory limit by the deposit guarantee.',
    category: 'Security',
  },
  {
    question: 'How do I change my address?',
    answer: 'Update it in Profile. We may ask for proof of address before the change takes effect.',
    category: 'Account',
  },
];

/**
 * A branch or ATM.
 *
 * `kind` is resolved from the overrides *before* the derived fields are computed. Left
 * to the plain spread, `makeLocation({ overrides: { kind: 'BRANCH' } })` would return a
 * branch with no deposit machine and ATM-only services — a fixture that contradicts
 * itself, which is the failure mode this whole package exists to avoid.
 */
export function makeLocation(options: { overrides?: Partial<BankLocation> }): BankLocation {
  const kind =
    options.overrides?.kind ?? pickOne([LocationKind.BRANCH, LocationKind.ATM, LocationKind.BOTH]);
  // `faker.location.city()` invents American place names, which were then rendered
  // beside a GB postcode in the branch finder — "Reliance Upton Runte, SW1A 2BQ".
  const place = pickOne(UK_BRANCH_LOCATIONS);
  const city = place.city;
  const isAtmOnly = kind === LocationKind.ATM;

  return {
    id: opaqueId(),
    name: `Reliance ${city}`,
    addressLine: place.address,
    city,
    postalCode: postcode(),
    country: 'GB',
    latitude: faker.number.float({ min: 50.1, max: 57.8, fractionDigits: 5 }),
    longitude: faker.number.float({ min: -5.5, max: 1.6, fractionDigits: 5 }),
    phone: `+4420${faker.string.numeric(8)}`,
    openingHours: WEEKDAYS.map((day) => ({
      day,
      opens: day === 'SUN' ? null : '09:00',
      closes: day === 'SUN' ? null : '17:00',
    })),
    wheelchairAccessible: true,
    distanceMetres: null,
    ...options.overrides,
    kind,
    services: isAtmOnly ? ['Cash withdrawal'] : ['Cash', 'Advice', 'Business'],
    hasDepositMachine: !isAtmOnly,
  };
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** A run of notifications, newest first. */
export function makeNotifications(clock: MockClock, count: number): Notification[] {
  return times(count, () => makeNotification({ clock })).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
