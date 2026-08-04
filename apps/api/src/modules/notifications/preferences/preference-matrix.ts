/**
 * The category × channel matrix, and the one rule that overrides it.
 *
 * Pure functions over plain values. This is the file that decides whether a customer hears
 * about something, so it is written to be exhaustively testable without a database, a
 * clock or a Nest container anywhere near it.
 *
 * **The rule.** A `SECURITY` notification is delivered on the mandatory channels whatever
 * the stored preference says. It is enforced *here*, at the point of resolution, and not
 * by refusing to save the preference. A validator can be bypassed by a new endpoint that
 * forgets to call it; a resolver cannot, because every delivery decision goes through it.
 */

import {
  NotificationCategory,
  NotificationChannel,
  type ChannelPreference,
} from '@reliance/contracts';

import {
  ALL_CATEGORIES,
  ALL_CHANNELS,
  ALWAYS_DELIVER_CATEGORIES,
  MANDATORY_CHANNELS,
} from '../notifications.constants.js';

/** Channels switched on for a category before the customer touches anything. */
const DEFAULT_ON: Readonly<Record<NotificationCategory, readonly NotificationChannel[]>> =
  Object.freeze({
    [NotificationCategory.SECURITY]: [
      NotificationChannel.IN_APP,
      NotificationChannel.EMAIL,
      NotificationChannel.PUSH,
    ],
    [NotificationCategory.TRANSACTION]: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
    [NotificationCategory.ACCOUNT]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    [NotificationCategory.CARD]: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
    [NotificationCategory.LENDING]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    [NotificationCategory.SAVINGS]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    [NotificationCategory.SUPPORT]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    [NotificationCategory.STATEMENT]: [NotificationChannel.EMAIL],
    // Opt-in, and it stays that way. A bank that defaults marketing on is a bank whose
    // customers learn to ignore its email, which then costs it the messages that matter.
    [NotificationCategory.MARKETING]: [],
    [NotificationCategory.SYSTEM]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });

/** The matrix a customer who has never opened the preferences screen has. */
export function defaultPreferences(): ChannelPreference[] {
  return ALL_CATEGORIES.map((category) => {
    const on = new Set(DEFAULT_ON[category]);
    return {
      category,
      inApp: on.has(NotificationChannel.IN_APP),
      email: on.has(NotificationChannel.EMAIL),
      sms: on.has(NotificationChannel.SMS),
      push: on.has(NotificationChannel.PUSH),
    };
  });
}

/** True when the customer is not permitted to switch this category off. */
export function isMandatory(category: NotificationCategory): boolean {
  return ALWAYS_DELIVER_CATEGORIES.includes(category);
}

/** Reads one cell out of a preference row. */
function isEnabled(row: ChannelPreference, channel: NotificationChannel): boolean {
  switch (channel) {
    case NotificationChannel.IN_APP: {
      return row.inApp;
    }
    case NotificationChannel.EMAIL: {
      return row.email;
    }
    case NotificationChannel.SMS: {
      return row.sms;
    }
    case NotificationChannel.PUSH: {
      return row.push;
    }
  }
}

export interface ResolveChannelsInput {
  readonly category: NotificationCategory;
  /** Channels this particular message is capable of using. */
  readonly candidateChannels: readonly NotificationChannel[];
  readonly preferences: readonly ChannelPreference[];
  /** Channels with no working address — an unverified phone, a degraded email. */
  readonly unavailableChannels?: readonly NotificationChannel[];
}

/**
 * Decides which channels a notification actually goes down.
 *
 * Order of reasoning:
 * 1. A mandatory category is delivered on {@link MANDATORY_CHANNELS} plus anything the
 *    customer has additionally switched on. Muting is not consulted for the mandatory set.
 * 2. Otherwise the customer's matrix filters the message's candidate channels.
 * 3. Channels with no usable address are dropped last — **except** for a mandatory
 *    category, where in-app always survives, because the notification centre needs no
 *    address and a customer with a bounced email must still be able to find out.
 */
export function resolveChannels(input: ResolveChannelsInput): NotificationChannel[] {
  const unavailable = new Set(input.unavailableChannels ?? []);
  const mandatory = isMandatory(input.category);
  const row = input.preferences.find((entry) => entry.category === input.category);

  const chosen = ALL_CHANNELS.filter((channel) => {
    if (mandatory && MANDATORY_CHANNELS.includes(channel)) return true;
    if (!input.candidateChannels.includes(channel)) return false;
    return row ? isEnabled(row, channel) : false;
  });

  return chosen.filter(
    (channel) => !unavailable.has(channel) || (mandatory && channel === NotificationChannel.IN_APP),
  );
}

/**
 * Merges a customer's submitted matrix over the defaults.
 *
 * A partial submission is normal — the preferences screen sends the rows it rendered — and
 * a category the client did not mention keeps whatever it had rather than silently
 * reverting to a default the customer never chose.
 */
export function mergePreferences(
  current: readonly ChannelPreference[],
  submitted: readonly ChannelPreference[],
): ChannelPreference[] {
  const base = current.length > 0 ? current : defaultPreferences();

  return ALL_CATEGORIES.map((category) => {
    const incoming = submitted.find((entry) => entry.category === category);
    const existing = base.find((entry) => entry.category === category);
    return incoming ?? existing ?? blankRow(category);
  });
}

function blankRow(category: NotificationCategory): ChannelPreference {
  return { category, inApp: false, email: false, sms: false, push: false };
}

/**
 * What the customer is shown.
 *
 * A mandatory category is returned with its mandatory channels forced on, so the screen
 * cannot render a switch that looks off while the platform is still delivering. Showing a
 * control that does not control anything is worse than showing none.
 */
export function presentPreferences(stored: readonly ChannelPreference[]): ChannelPreference[] {
  const rows = stored.length > 0 ? [...stored] : defaultPreferences();

  return rows.map((row) =>
    isMandatory(row.category)
      ? {
          ...row,
          inApp: row.inApp || MANDATORY_CHANNELS.includes(NotificationChannel.IN_APP),
          email: row.email || MANDATORY_CHANNELS.includes(NotificationChannel.EMAIL),
        }
      : row,
  );
}
