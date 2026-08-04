'use client';

/**
 * The month ahead, with the payments that fall in it.
 *
 * A calendar answers a question a list cannot: "is anything going out before I get paid?" Rendered
 * as a table with real day headers, so a screen reader can say "Tuesday 14, two payments" rather
 * than reading forty-two unlabelled cells.
 *
 * Only the payments the bank has actually scheduled are shown. Projecting a recurring order
 * forward here would produce dates the API might not agree with, and a calendar that disagrees
 * with the schedule is worse than no calendar.
 */

import type { TransferOrder } from '@reliance/contracts';
import { cn, MoneyText } from '@reliance/ui';

import { nowMs } from '@/lib/clock';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET = 6;

/** Props for {@link ScheduleCalendar}. */
export interface ScheduleCalendarProps {
  readonly orders: readonly TransferOrder[];
}

/** Payments due, keyed by day of the month, for the month currently in view. */
function byDay(orders: readonly TransferOrder[], month: number, year: number) {
  const map = new Map<number, TransferOrder[]>();

  for (const order of orders) {
    if (!order.nextRunAt) continue;
    const due = new Date(order.nextRunAt);
    if (due.getMonth() !== month || due.getFullYear() !== year) continue;
    const day = due.getDate();
    map.set(day, [...(map.get(day) ?? []), order]);
  }

  return map;
}

/** One day cell: its number, and anything going out that day. */
function DayCell({
  day,
  orders,
}: {
  readonly day: number | null;
  readonly orders: TransferOrder[];
}) {
  if (day === null) return <td className="border-border bg-surface-sunken/40 h-20 border" />;

  return (
    <td className="border-border h-20 border p-1 align-top">
      <span className="text-fg-muted block text-xs font-medium">{day}</span>
      {orders.map((order) => (
        <span key={order.id} className="text-fg mt-0.5 block truncate text-xs">
          <MoneyText
            amount={order.amount.amount}
            currency={order.amount.currency}
            size="sm"
            muted
          />{' '}
          {order.name}
        </span>
      ))}
    </td>
  );
}

/** The grid of days, padded so the first of the month lands on the right weekday. */
function weeksOf(month: number, year: number): (number | null)[][] {
  const firstWeekday = (new Date(year, month, 1).getDay() + MONDAY_OFFSET) % DAYS_PER_WEEK;
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_unused, index) => index + 1),
  ];
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);

  return Array.from({ length: cells.length / DAYS_PER_WEEK }, (_unused, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
}

/**
 * @example <ScheduleCalendar orders={orders} />
 */
/** The seven column headings. */
function WeekdayHeader() {
  return (
    <thead>
      <tr>
        {WEEKDAYS.map((day) => (
          <th
            key={day}
            scope="col"
            className={cn('border-border border p-1', 'text-fg-muted text-xs font-medium')}
          >
            {day}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function ScheduleCalendar({ orders }: ScheduleCalendarProps) {
  const today = new Date(nowMs());
  const month = today.getMonth();
  const year = today.getFullYear();
  const due = byDay(orders, month, year);
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
    today,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-2xl border-collapse text-sm">
        <caption className="text-fg-muted pb-2 text-left text-sm">
          Payments scheduled in {monthName}
        </caption>
        <WeekdayHeader />
        <tbody>
          {weeksOf(month, year).map((week) => (
            <tr key={`week-${week.find((day) => day !== null) ?? 'blank'}`}>
              {week.map((day, index) => (
                <DayCell
                  key={day ?? `pad-${index}`}
                  day={day}
                  orders={day === null ? [] : (due.get(day) ?? [])}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
