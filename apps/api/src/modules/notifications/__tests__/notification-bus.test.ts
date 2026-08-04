import { NotificationCategory, NotificationChannel } from '@reliance/contracts';

import { DeliveryStatus } from '../delivery/delivery.types.js';
import { ALL_CATEGORIES } from '../notifications.constants.js';
import { defaultPreferences } from '../preferences/preference-matrix.js';
import { type SavePreferenceInput } from '../preferences/preference.store.js';

import { buildBusHarness, RECIPIENT, USER_ID } from './bus-test.helpers.js';

/** March 2026 is still GMT in London, so local and UTC coincide in these fixtures. */
const LATE_EVENING = new Date('2026-03-14T23:30:00.000Z');
const QUIET_WINDOW_END = new Date('2026-03-15T07:00:00.000Z');
const DIGEST_WINDOW_MS = 241 * 60_000;

const LOGIN_ALERT_PROPS = {
  deviceLabel: 'Chrome on Windows',
  location: 'Manchester, United Kingdom',
  signedInAt: '14 March 2026 at 23:30',
  ipAddress: '81.***.***.114',
} as const;

const MARKETING_PROPS = {
  monthLabel: 'March',
  spentFormatted: '£2,988.51',
  topCategory: 'Groceries',
  topCategoryFormatted: '£486.20',
  versusLastMonth: '£142 less than February',
} as const;

const BUDGET_PROPS = {
  categoryName: 'Eating out',
  spentFormatted: '£152.00',
  budgetFormatted: '£200.00',
  daysLeft: '11',
} as const;

type Harness = ReturnType<typeof buildBusHarness>;

/** Every category switched off on every channel — including a forged all-off security row. */
function mutedEverything(userId: string): SavePreferenceInput {
  return {
    userId,
    preferences: ALL_CATEGORIES.map((category) => ({
      category,
      inApp: false,
      email: false,
      sms: false,
      push: false,
    })),
    quietHours: null,
    timezone: 'Europe/London',
    digestEnabledCategories: [],
  };
}

function withRowOverride(
  base: SavePreferenceInput,
  category: SavePreferenceInput['preferences'][number]['category'],
  override: Partial<SavePreferenceInput['preferences'][number]>,
): SavePreferenceInput {
  return {
    ...base,
    preferences: base.preferences.map((row) =>
      row.category === category ? { ...row, ...override } : row,
    ),
  };
}

async function savePreferences(harness: Harness, input: SavePreferenceInput): Promise<void> {
  await harness.preferenceStore.save(input);
}

describe('NotificationBus — the mandatory security rule', () => {
  it('fans a security alert out to the centre and email with everything muted', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await savePreferences(harness, mutedEverything(USER_ID));

    const result = await harness.bus.publish(USER_ID, 'LOGIN_ALERT', LOGIN_ALERT_PROPS);

    expect(result.notification?.category).toBe(NotificationCategory.SECURITY);
    expect(result.channels).toEqual([NotificationChannel.IN_APP, NotificationChannel.EMAIL]);
    expect(result.heldUntil).toBeNull();
    expect(harness.email.sentInputs).toHaveLength(1);
    expect(harness.email.sentInputs[0]?.message.summary).toContain('New sign-in');
    expect(await harness.notifications.countUnread(USER_ID)).toBe(1);
  });

  it('suppresses a marketing message when marketing is muted', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await savePreferences(harness, mutedEverything(USER_ID));

    const result = await harness.bus.publish(USER_ID, 'MONTHLY_INSIGHTS', MARKETING_PROPS);

    expect(result.notification).toBeNull();
    expect(result.channels).toEqual([]);
    expect(harness.email.sentInputs).toHaveLength(0);
    expect(await harness.notifications.countUnread(USER_ID)).toBe(0);
  });

  it('delivers the same marketing message once the customer opts in', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    const optedIn = withRowOverride(mutedEverything(USER_ID), NotificationCategory.MARKETING, {
      inApp: true,
      email: true,
    });
    await savePreferences(harness, optedIn);

    const result = await harness.bus.publish(USER_ID, 'MONTHLY_INSIGHTS', MARKETING_PROPS);

    expect(result.notification?.category).toBe(NotificationCategory.MARKETING);
    expect(result.channels).toEqual([NotificationChannel.IN_APP, NotificationChannel.EMAIL]);
    expect(harness.email.sentInputs).toHaveLength(1);
  });

  it('drops the publish quietly when the customer does not exist', async () => {
    const harness = buildBusHarness(LATE_EVENING);

    const result = await harness.bus.publish(
      'usr_00000000000000000000000000',
      'LOGIN_ALERT',
      LOGIN_ALERT_PROPS,
    );

    expect(result).toEqual({ notification: null, channels: [], heldUntil: null });
    expect(harness.email.sentInputs).toHaveLength(0);
  });
});

describe('NotificationBus — quiet hours', () => {
  async function withQuietHours(harness: Harness): Promise<void> {
    await savePreferences(harness, {
      userId: USER_ID,
      preferences: defaultPreferences(),
      quietHours: { from: '22:00', to: '07:00' },
      timezone: 'Europe/London',
      digestEnabledCategories: [],
    });
  }

  it('holds a routine email until the window ends but writes the centre copy now', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await withQuietHours(harness);

    const result = await harness.bus.publish(USER_ID, 'BUDGET_THRESHOLD', BUDGET_PROPS);

    expect(result.notification).not.toBeNull();
    expect(result.heldUntil).toEqual(QUIET_WINDOW_END);
    expect(harness.email.sentInputs).toHaveLength(0);

    const [held] = await harness.deliveryStore.listForUser(USER_ID, 10);
    expect(held?.status).toBe(DeliveryStatus.QUEUED);
    expect(held?.nextAttemptAt).toEqual(QUIET_WINDOW_END);
  });

  it('sends a security alert immediately, quiet hours or not', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await withQuietHours(harness);

    const result = await harness.bus.publish(USER_ID, 'LOGIN_ALERT', LOGIN_ALERT_PROPS);

    expect(result.heldUntil).toBeNull();
    expect(harness.email.sentInputs).toHaveLength(1);
  });
});

describe('NotificationBus — digest batching', () => {
  async function withDigestFor(harness: Harness, categories: readonly string[]): Promise<void> {
    await savePreferences(harness, {
      userId: USER_ID,
      preferences: defaultPreferences(),
      quietHours: null,
      timezone: 'Europe/London',
      digestEnabledCategories: categories,
    });
  }

  it('batches a category the customer asked to batch and flushes it once', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await withDigestFor(harness, [NotificationCategory.ACCOUNT]);

    const result = await harness.bus.publish(USER_ID, 'BUDGET_THRESHOLD', BUDGET_PROPS);

    // The in-app copy is written at once; only the email waits for the digest.
    expect(result.notification).not.toBeNull();
    expect(harness.email.sentInputs).toHaveLength(0);
    expect((await harness.digestStore.findOpen(USER_ID))?.items).toHaveLength(1);

    harness.clock.advance(DIGEST_WINDOW_MS);
    expect(await harness.digests.flushDue()).toBe(1);

    expect(harness.email.sentInputs).toHaveLength(1);
    expect(harness.email.sentInputs[0]?.message.templateKey).toBe('NOTIFICATION_DIGEST');
    expect(await harness.digestStore.findOpen(USER_ID)).toBeNull();
  });

  it('sends immediately when the message category is not one the customer batches', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await withDigestFor(harness, [NotificationCategory.MARKETING]);

    await harness.bus.publish(USER_ID, 'BUDGET_THRESHOLD', BUDGET_PROPS);

    expect(harness.email.sentInputs).toHaveLength(1);
    expect(harness.email.sentInputs[0]?.message.templateKey).toBe('BUDGET_THRESHOLD');
    expect(await harness.digestStore.findOpen(USER_ID)).toBeNull();
  });

  it('never batches a security alert, even if a stale preference row asks for it', async () => {
    const harness = buildBusHarness(LATE_EVENING);
    await withDigestFor(harness, [NotificationCategory.SECURITY]);

    await harness.bus.publish(USER_ID, 'LOGIN_ALERT', LOGIN_ALERT_PROPS);

    expect(harness.email.sentInputs).toHaveLength(1);
    expect(await harness.digestStore.findOpen(USER_ID)).toBeNull();
  });
});

describe('NotificationBus — recipient addressing', () => {
  it('skips the email channel entirely when the customer has no usable address', async () => {
    const emailless = buildBusHarness(LATE_EVENING, { ...RECIPIENT, emailAddress: null });
    await savePreferences(emailless, {
      userId: USER_ID,
      preferences: defaultPreferences(),
      quietHours: null,
      timezone: 'Europe/London',
      digestEnabledCategories: [],
    });

    const result = await emailless.bus.publish(USER_ID, 'BUDGET_THRESHOLD', BUDGET_PROPS);

    // The centre copy is the guaranteed record; the addressless channel is dropped at
    // resolution, so no failed attempts accumulate against it.
    expect(result.notification).not.toBeNull();
    expect(result.channels).toEqual([NotificationChannel.IN_APP]);
    expect(emailless.email.sentInputs).toHaveLength(0);
    expect(await emailless.deliveryStore.listForUser(USER_ID, 10)).toEqual([]);
  });
});
