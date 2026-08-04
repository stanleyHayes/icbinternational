/**
 * Presentation formatting — dates, times and the partial masking of contact details.
 *
 * Money is deliberately absent. Every amount in this app renders through `MoneyText`, which is
 * currency-aware, tabular and coloured by sign; a second formatter here would be the one number in
 * the bank that disagrees with the rest.
 */

import { nowMs } from './clock';

/** The bank's presentation locale. Overridden per customer once the preference lands. */
const LOCALE = 'en-GB';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDayFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

/** A full date: `4 March 2026`. Used wherever a date is a fact rather than a timestamp. */
export function formatDate(isoInstant: string): string {
  return dayFormat.format(new Date(isoInstant));
}

/** A date and time: `4 Mar, 14:32`. For a feed, where both matter and space does not allow more. */
export function formatDateTime(isoInstant: string): string {
  const at = new Date(isoInstant);
  return `${shortDayFormat.format(at)}, ${timeFormat.format(at)}`;
}

/**
 * How long ago something happened, in words.
 *
 * Falls back to a real date after a week: "3 weeks ago" is worse than "12 February" for anything a
 * customer might have to quote to us.
 */
export function relativeTime(isoInstant: string): string {
  const at = new Date(isoInstant).getTime();
  if (Number.isNaN(at)) return '';

  const minutes = Math.round((at - nowMs()) / MS_PER_MINUTE);
  const absolute = Math.abs(minutes);

  if (absolute < MINUTES_PER_HOUR) return relative.format(minutes, 'minute');
  if (absolute < MINUTES_PER_HOUR * HOURS_PER_DAY) {
    return relative.format(Math.round(minutes / MINUTES_PER_HOUR), 'hour');
  }

  const days = Math.round(minutes / (MINUTES_PER_HOUR * HOURS_PER_DAY));
  if (Math.abs(days) < DAYS_PER_WEEK) return relative.format(days, 'day');
  return formatDate(isoInstant);
}

const EMAIL_VISIBLE_CHARACTERS = 2;

/**
 * `am••••@example.com`.
 *
 * Shown when confirming where a code was sent. Enough for the customer to recognise the address,
 * not enough for someone reading over their shoulder to learn it.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const visible = local.slice(0, Math.min(EMAIL_VISIBLE_CHARACTERS, local.length));
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}${email.slice(at)}`;
}

const PHONE_VISIBLE_DIGITS = 3;

/** `•••••• 123` — the last digits only, which is all anyone needs to recognise their own number. */
export function maskPhone(phone: string): string {
  const digits = phone.replaceAll(/\D/g, '');
  const tail = digits.slice(-PHONE_VISIBLE_DIGITS);
  return `•••••• ${tail}`;
}
