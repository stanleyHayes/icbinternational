import { NameCheckResult } from '@reliance/contracts';

import { checkPayeeName, editDistanceWithin } from '../name-check.js';

const REGISTERED = 'Ada Lovelace';

describe('Confirmation of Payee', () => {
  it('matches an exact name', () => {
    expect(checkPayeeName('Ada Lovelace', REGISTERED)).toEqual({
      result: NameCheckResult.MATCH,
      suggestion: null,
    });
  });

  it.each([
    ['case', 'ADA LOVELACE'],
    ['punctuation', 'Ada  Lovelace!'],
    ['an honorific', 'Ms Ada Lovelace'],
    ['reversed order', 'Lovelace, Ada'],
  ])('matches despite %s', (_reason, claimed) => {
    expect(checkPayeeName(claimed, REGISTERED).result).toBe(NameCheckResult.MATCH);
  });

  it('reports a close match on a typo and offers the registered name', () => {
    expect(checkPayeeName('Ada Lovelase', REGISTERED)).toEqual({
      result: NameCheckResult.CLOSE_MATCH,
      suggestion: REGISTERED,
    });
  });

  it('reports a close match on an initial', () => {
    expect(checkPayeeName('A Lovelace', REGISTERED).result).toBe(NameCheckResult.CLOSE_MATCH);
  });

  it('reports a close match when only the surname is given', () => {
    expect(checkPayeeName('Lovelace', REGISTERED).result).toBe(NameCheckResult.CLOSE_MATCH);
  });

  it('reports no match for a different person', () => {
    expect(checkPayeeName('Grace Hopper', REGISTERED)).toEqual({
      result: NameCheckResult.NO_MATCH,
      suggestion: null,
    });
  });

  /**
   * The security property, stated as a test.
   *
   * Returning the registered name for a wrong guess would turn the endpoint into a name
   * oracle: an attacker with a list of account numbers could read the holder off each one.
   */
  it('never reveals the registered name on a no-match', () => {
    for (const guess of ['Grace Hopper', 'Zzz', 'unrelated person entirely']) {
      expect(checkPayeeName(guess, REGISTERED).suggestion).toBeNull();
    }
  });

  it('answers UNAVAILABLE when the receiving bank has no answer', () => {
    expect(checkPayeeName('Anyone At All', null)).toEqual({
      result: NameCheckResult.UNAVAILABLE,
      suggestion: null,
    });
  });

  it('treats a name of nothing but honorifics as no match', () => {
    expect(checkPayeeName('Mr Dr', REGISTERED).result).toBe(NameCheckResult.NO_MATCH);
  });
});

describe('the typo tolerance', () => {
  it('accepts edits within the limit', () => {
    expect(editDistanceWithin('lovelace', 'lovelase', 2)).toBe(true);
    expect(editDistanceWithin('lovelace', 'lovelac', 2)).toBe(true);
  });

  it('rejects words that only differ in length', () => {
    expect(editDistanceWithin('ada', 'alexandra', 2)).toBe(false);
  });

  it('rejects words that differ throughout', () => {
    expect(editDistanceWithin('hopper', 'lovelace', 2)).toBe(false);
  });

  it('accepts an identical word at a limit of zero', () => {
    expect(editDistanceWithin('ada', 'ada', 0)).toBe(true);
    expect(editDistanceWithin('ada', 'adb', 0)).toBe(false);
  });
});
