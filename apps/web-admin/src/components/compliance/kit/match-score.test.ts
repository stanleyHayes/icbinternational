/**
 * Where the screening bands sit.
 *
 * The thresholds are a policy decision, not an implementation detail: moving the "strong"
 * boundary changes how many customers a compliance team must look at by hand. Pinning the
 * boundaries here means a change to them is a change somebody had to make deliberately.
 */

import { scoreBand, scoreBandLabel } from './match-score';

describe('scoreBand', () => {
  it('treats 85 and above as a strong match', () => {
    expect(scoreBand(85)).toBe('strong');
    expect(scoreBand(96)).toBe('strong');
  });

  it('treats 65 up to but not including 85 as a possible match', () => {
    expect(scoreBand(65)).toBe('possible');
    expect(scoreBand(84)).toBe('possible');
  });

  it('treats anything below 65 as weak', () => {
    expect(scoreBand(64)).toBe('weak');
    expect(scoreBand(0)).toBe('weak');
  });
});

describe('scoreBandLabel', () => {
  it('names the band in words, so colour is never the only signal', () => {
    expect(scoreBandLabel(91)).toBe('Strong match');
    expect(scoreBandLabel(70)).toBe('Possible match');
    expect(scoreBandLabel(12)).toBe('Weak match');
  });
});
