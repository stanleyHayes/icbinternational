import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { InMemoryNotificationStore } from '../in-memory-notification.store.js';
import { NotificationCentreService } from '../notification-centre.service.js';
import { type NewNotification, type NotificationRecord } from '../notification.store.js';
import { NOTIFICATION_RETENTION_DAYS } from '../notifications.constants.js';
import { NotificationStreamService } from '../stream/notification-stream.service.js';

import { USER_ID } from './bus-test.helpers.js';

const NOW = new Date('2026-03-15T09:00:00.000Z');
const CLOCK = { now: () => NOW, timestamp: () => NOW.getTime() } as unknown as ClockService;
const OTHER_USER = 'usr_01JQY4G8A8ZX1K5M3K0Z3X0K99';
const DAY_MS = 86_400_000;

interface Harness {
  readonly store: InMemoryNotificationStore;
  readonly centre: NotificationCentreService;
}

function build(): Harness {
  const store = new InMemoryNotificationStore();
  const stream = new NotificationStreamService(CLOCK);
  return { store, centre: new NotificationCentreService(store, stream, CLOCK) };
}

function insert(
  store: InMemoryNotificationStore,
  overrides: Partial<NewNotification> & { readonly createdAt?: Date } = {},
): Promise<NotificationRecord> {
  const { createdAt, ...rest } = overrides;
  const notification: NewNotification = {
    userId: USER_ID,
    category: NotificationCategory.ACCOUNT,
    severity: NotificationSeverity.INFO,
    templateKey: 'BUDGET_THRESHOLD',
    title: 'You are close to a budget',
    body: 'You have used £152.00 of your £200.00 Eating out budget.',
    actionUrl: null,
    actionLabel: null,
    iconKey: 'account',
    ...rest,
  };
  return store.insert(notification, createdAt ?? NOW);
}

async function insertThree(store: InMemoryNotificationStore): Promise<NotificationRecord[]> {
  return [
    await insert(store, { title: 'oldest', createdAt: new Date(NOW.getTime() - 2 * DAY_MS) }),
    await insert(store, { title: 'middle', createdAt: new Date(NOW.getTime() - DAY_MS) }),
    await insert(store, { title: 'newest', createdAt: NOW }),
  ];
}

describe('NotificationCentreService.list', () => {
  it('lists newest first and follows its own cursor to the next page', async () => {
    const { store, centre } = build();
    await insertThree(store);

    const first = await centre.list({ userId: USER_ID, limit: 2, unreadOnly: false });

    expect(first.data.map((record) => record.title)).toEqual(['newest', 'middle']);
    expect(first.page.hasMore).toBe(true);

    const second = await centre.list({
      userId: USER_ID,
      limit: 2,
      unreadOnly: false,
      ...(first.page.cursor ? { cursor: first.page.cursor } : {}),
    });

    expect(second.data.map((record) => record.title)).toEqual(['oldest']);
    expect(second.page.hasMore).toBe(false);
    expect(second.page.cursor).toBeNull();
  });

  it('never lists another customer’s notifications', async () => {
    const { store, centre } = build();
    await insert(store, { userId: OTHER_USER, title: 'not yours' });

    const page = await centre.list({ userId: USER_ID, limit: 10, unreadOnly: false });

    expect(page.data).toEqual([]);
  });

  it('filters by category and unread state', async () => {
    const { store, centre } = build();
    const read = await insert(store, { category: NotificationCategory.SAVINGS });
    await insert(store, { category: NotificationCategory.SECURITY });
    await store.markRead(USER_ID, [read.id], NOW);

    const unreadSecurity = await centre.list({
      userId: USER_ID,
      limit: 10,
      unreadOnly: true,
      category: NotificationCategory.SECURITY,
    });

    expect(unreadSecurity.data).toHaveLength(1);
    expect(unreadSecurity.data[0]?.category).toBe(NotificationCategory.SECURITY);
  });
});

describe('NotificationCentreService.markRead', () => {
  it('marks only the given ids and reports how many changed', async () => {
    const { store, centre } = build();
    const [first] = await insertThree(store);

    const changed = await centre.markRead(USER_ID, [first!.id]);

    expect(changed).toBe(1);
    expect(await centre.unreadCount(USER_ID)).toBe(2);
  });

  it('cannot mark another customer’s notification read', async () => {
    const { store, centre } = build();
    const foreign = await insert(store, { userId: OTHER_USER });

    const changed = await centre.markRead(USER_ID, [foreign.id]);

    expect(changed).toBe(0);
    expect(await store.countUnread(OTHER_USER)).toBe(1);
  });

  it('marks everything read when given no ids', async () => {
    const { store, centre } = build();
    await insertThree(store);
    await insert(store, { userId: OTHER_USER });

    const changed = await centre.markRead(USER_ID, []);

    expect(changed).toBe(3);
    expect(await centre.unreadCount(USER_ID)).toBe(0);
    expect(await store.countUnread(OTHER_USER)).toBe(1);
  });
});

describe('NotificationCentreService.purgeExpired', () => {
  it('removes only records past the retention period', async () => {
    const { store, centre } = build();
    await insert(store, {
      title: 'ancient',
      createdAt: new Date(NOW.getTime() - (NOTIFICATION_RETENTION_DAYS + 1) * DAY_MS),
    });
    await insert(store, { title: 'recent', createdAt: NOW });

    const purged = await centre.purgeExpired();

    expect(purged).toBe(1);
    const remaining = await centre.list({ userId: USER_ID, limit: 10, unreadOnly: false });
    expect(remaining.data.map((record) => record.title)).toEqual(['recent']);
  });
});
