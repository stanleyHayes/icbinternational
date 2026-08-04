import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

/** A window of history, inclusive at both ends. */
export interface Period {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Parses and validates the window every insight is computed over.
 *
 * Rejecting an inverted range here rather than letting it return an empty result is the
 * difference between a customer seeing "you spent nothing in March" and being told their
 * dates are the wrong way round. An empty answer to a malformed question is the most
 * expensive kind of wrong.
 */
export function toPeriod(from: string, to: string): Period {
  const start = new Date(from);
  const end = new Date(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badRange('The period must be two ISO-8601 instants.');
  }
  if (start > end) {
    throw badRange('The start of the period must not be after its end.');
  }

  return { from: start, to: end };
}

/**
 * The equally long window immediately before this one.
 *
 * Comparison periods are defined by duration rather than by calendar, so "the last 30
 * days" compares against the 30 before it and a single month compares against the month
 * before. Aligning to calendar months instead would make a 45-day range compare against
 * something of a different length, and the percentage change would be meaningless.
 *
 * The previous period ends one millisecond before this one starts, so nothing is counted
 * in both — a transaction landing exactly on the boundary must appear once.
 */
export function previousPeriod(period: Period): Period {
  const span = period.to.getTime() - period.from.getTime();
  const end = new Date(period.from.getTime() - 1);

  return { from: new Date(end.getTime() - span), to: end };
}

function badRange(message: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_FAILED, message });
}
