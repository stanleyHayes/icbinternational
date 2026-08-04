import { PaymentRailName } from '../../ports/payment-rail.types.js';
import {
  assertValidSchedule,
  isBusinessDay,
  isPastFinalCutOff,
  nextSettlementSlot,
  type RailSchedule,
} from '../rail-schedule.js';

/** Monday 2026-08-03 .. Sunday 2026-08-09 (verified against `Date.getUTCDay`). */
const MONDAY = new Date(Date.UTC(2026, 7, 3, 8, 0, 0));
const SATURDAY = new Date(Date.UTC(2026, 7, 8, 8, 0, 0));

/** Two daily windows, next-day value: a small ACH-alike for readable assertions. */
const SCHEDULE: RailSchedule = {
  rail: PaymentRailName.ACH,
  windows: [
    { hourUtc: 10, minuteUtc: 30 },
    { hourUtc: 16, minuteUtc: 30 },
  ],
  valueDateLagBusinessDays: 1,
};

describe('rail schedule', () => {
  it('knows the network rests at the weekend', () => {
    expect(isBusinessDay(MONDAY)).toBe(true);
    expect(isBusinessDay(SATURDAY)).toBe(false);
  });

  it('assigns a payment before the first window to that window', () => {
    const slot = nextSettlementSlot(SCHEDULE, MONDAY);

    expect(slot.settleAt).toEqual(new Date(Date.UTC(2026, 7, 3, 10, 30, 0)));
    expect(slot.batchId).toBe('BATCH-ACH-20260803-01');
  });

  it('assigns a payment between windows to the later one', () => {
    const slot = nextSettlementSlot(SCHEDULE, new Date(Date.UTC(2026, 7, 3, 12, 0, 0)));

    expect(slot.batchId).toBe('BATCH-ACH-20260803-02');
  });

  it('rolls a payment past the final window to the next business day', () => {
    const slot = nextSettlementSlot(SCHEDULE, new Date(Date.UTC(2026, 7, 3, 17, 0, 0)));

    expect(slot.batchId).toBe('BATCH-ACH-20260804-01');
    expect(slot.settleAt).toEqual(new Date(Date.UTC(2026, 7, 4, 10, 30, 0)));
  });

  it('skips the weekend entirely: Friday evening settles Monday', () => {
    const fridayEvening = new Date(Date.UTC(2026, 7, 7, 18, 0, 0));
    const slot = nextSettlementSlot(SCHEDULE, fridayEvening);

    expect(slot.batchId).toBe('BATCH-ACH-20260810-01');
  });

  it('applies the value-date lag in business days: a Friday batch lands Monday', () => {
    const fridayMorning = new Date(Date.UTC(2026, 7, 7, 9, 0, 0));
    const slot = nextSettlementSlot(SCHEDULE, fridayMorning);

    expect(slot.batchId).toContain('20260807');
    expect(slot.valueDate).toBe('2026-08-10');
  });

  it('carries zero lag on the settlement day itself', () => {
    const rtgs: RailSchedule = { ...SCHEDULE, valueDateLagBusinessDays: 0 };

    expect(nextSettlementSlot(rtgs, MONDAY).valueDate).toBe('2026-08-03');
  });

  it('marks the final cut-off passed only after it, on business days', () => {
    expect(isPastFinalCutOff(SCHEDULE, new Date(Date.UTC(2026, 7, 3, 16, 29, 0)))).toBe(false);
    expect(isPastFinalCutOff(SCHEDULE, new Date(Date.UTC(2026, 7, 3, 16, 30, 0)))).toBe(true);
    expect(isPastFinalCutOff(SCHEDULE, SATURDAY)).toBe(false);
  });

  it('treats the closing instant itself as missed — a window closes, it does not linger', () => {
    const slot = nextSettlementSlot(SCHEDULE, new Date(Date.UTC(2026, 7, 3, 10, 30, 0)));

    expect(slot.batchId).toBe('BATCH-ACH-20260803-02');
  });

  it('rejects malformed schedules loudly', () => {
    expect(() => assertValidSchedule({ ...SCHEDULE, windows: [] })).toThrow(RangeError);
    expect(() =>
      assertValidSchedule({ ...SCHEDULE, windows: [{ hourUtc: 25, minuteUtc: 0 }] }),
    ).toThrow(RangeError);
    expect(() =>
      assertValidSchedule({
        ...SCHEDULE,
        windows: [
          { hourUtc: 16, minuteUtc: 30 },
          { hourUtc: 10, minuteUtc: 30 },
        ],
      }),
    ).toThrow(RangeError);
    expect(() => assertValidSchedule({ ...SCHEDULE, valueDateLagBusinessDays: -1 })).toThrow(
      RangeError,
    );
  });
});
