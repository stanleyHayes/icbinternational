/// <reference types="jest" />

import { highestRateBps, lowestRateBps } from './rates';

describe('highestRateBps', () => {
  it('picks the best rate a saver could get', () => {
    expect(highestRateBps([325, 425, 400])).toBe(425);
  });

  it('is null when nothing was published', () => {
    // The empty list is what a failed build-time fetch leaves behind. `Math.max()` returns
    // -Infinity here, which formats as "-Infinity.NaN%" — so the absence has to be a value
    // the caller is forced to handle, not a number that looks like a rate.
    expect(highestRateBps([])).toBeNull();
  });
});

describe('lowestRateBps', () => {
  it('picks the cheapest rate a borrower could get', () => {
    expect(lowestRateBps([1290, 690, 990])).toBe(690);
  });

  it('is null when nothing was published', () => {
    expect(lowestRateBps([])).toBeNull();
  });
});
