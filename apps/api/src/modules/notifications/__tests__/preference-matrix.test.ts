import {
  NotificationCategory,
  NotificationChannel,
  type ChannelPreference,
} from '@reliance/contracts';

import {
  defaultPreferences,
  isMandatory,
  mergePreferences,
  presentPreferences,
  resolveChannels,
} from '../preferences/preference-matrix.js';

const ALL_OFF = { inApp: false, email: false, sms: false, push: false } as const;

function row(
  category: ChannelPreference['category'],
  overrides: Partial<Omit<ChannelPreference, 'category'>> = {},
): ChannelPreference {
  return { category, ...ALL_OFF, ...overrides };
}

function marketingRow(): ChannelPreference {
  return (
    defaultPreferences().find((entry) => entry.category === NotificationCategory.MARKETING) ??
    row(NotificationCategory.MARKETING)
  );
}

describe('resolveChannels', () => {
  it('delivers a security alert on the mandatory channels when every switch is off', () => {
    const channels = resolveChannels({
      category: NotificationCategory.SECURITY,
      candidateChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      preferences: [row(NotificationCategory.SECURITY)],
    });

    expect(channels).toEqual([NotificationChannel.IN_APP, NotificationChannel.EMAIL]);
  });

  it('keeps the in-app copy of a security alert when the email address is unusable', () => {
    const channels = resolveChannels({
      category: NotificationCategory.SECURITY,
      candidateChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      preferences: [row(NotificationCategory.SECURITY)],
      unavailableChannels: [NotificationChannel.EMAIL],
    });

    expect(channels).toEqual([NotificationChannel.IN_APP]);
  });

  it('adds channels the customer switched on beyond the mandatory set', () => {
    const channels = resolveChannels({
      category: NotificationCategory.SECURITY,
      candidateChannels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
      preferences: [row(NotificationCategory.SECURITY, { sms: true })],
    });

    expect(channels).toEqual([
      NotificationChannel.IN_APP,
      NotificationChannel.EMAIL,
      NotificationChannel.SMS,
    ]);
  });

  it('suppresses a muted marketing message entirely', () => {
    const channels = resolveChannels({
      category: NotificationCategory.MARKETING,
      candidateChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      preferences: [row(NotificationCategory.MARKETING)],
    });

    expect(channels).toEqual([]);
  });

  it('delivers marketing on exactly the channels the customer opted into', () => {
    const channels = resolveChannels({
      category: NotificationCategory.MARKETING,
      candidateChannels: [
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
        NotificationChannel.PUSH,
      ],
      preferences: [row(NotificationCategory.MARKETING, { inApp: true, email: true })],
    });

    expect(channels).toEqual([NotificationChannel.IN_APP, NotificationChannel.EMAIL]);
  });

  it('drops channels with no usable address for ordinary categories', () => {
    const channels = resolveChannels({
      category: NotificationCategory.ACCOUNT,
      candidateChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      preferences: [row(NotificationCategory.ACCOUNT, { inApp: true, email: true })],
      unavailableChannels: [NotificationChannel.EMAIL],
    });

    expect(channels).toEqual([NotificationChannel.IN_APP]);
  });
});

describe('defaultPreferences', () => {
  it('opts the customer out of marketing until they ask for it', () => {
    expect(marketingRow()).toEqual({
      category: NotificationCategory.MARKETING,
      inApp: false,
      email: false,
      sms: false,
      push: false,
    });
  });

  it('switches the security channels on', () => {
    const security = defaultPreferences().find(
      (entry) => entry.category === NotificationCategory.SECURITY,
    );

    expect(security).toMatchObject({ inApp: true, email: true, push: true, sms: false });
  });
});

describe('isMandatory', () => {
  it('treats security as the one non-suppressible category', () => {
    expect(isMandatory(NotificationCategory.SECURITY)).toBe(true);
    expect(isMandatory(NotificationCategory.MARKETING)).toBe(false);
    expect(isMandatory(NotificationCategory.TRANSACTION)).toBe(false);
  });
});

describe('mergePreferences', () => {
  it('keeps the stored row for a category the submission did not mention', () => {
    const current = defaultPreferences().map((entry) =>
      entry.category === NotificationCategory.SAVINGS ? { ...entry, sms: true } : entry,
    );

    const merged = mergePreferences(current, [
      row(NotificationCategory.MARKETING, { email: true }),
    ]);

    expect(merged.find((entry) => entry.category === NotificationCategory.SAVINGS)?.sms).toBe(true);
    expect(merged.find((entry) => entry.category === NotificationCategory.MARKETING)?.email).toBe(
      true,
    );
  });

  it('starts from the defaults when nothing is stored yet', () => {
    const merged = mergePreferences([], []);

    expect(merged).toEqual(defaultPreferences());
  });
});

describe('presentPreferences', () => {
  it('shows the mandatory security switches as on, whatever was stored', () => {
    const presented = presentPreferences([row(NotificationCategory.SECURITY)]);

    expect(presented[0]).toMatchObject({ inApp: true, email: true, sms: false, push: false });
  });
});
