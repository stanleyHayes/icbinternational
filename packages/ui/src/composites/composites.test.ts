/**
 * The composites' pure logic: page-range collapsing, the sort comparator that must not coerce a
 * bigint, and the toast queue's capping and expiry.
 */

import { act, renderHook } from '@testing-library/react';

import { initialsFrom } from './avatar.js';
import { paginationRange } from './pagination.js';
import { compareValues, sortRows } from './table-sort.js';
import { DEFAULT_TOAST_DURATION_MS, MAX_VISIBLE_TOASTS, useToastQueue } from './use-toast-queue.js';

describe('paginationRange', () => {
  it('lists every page when the range is short', () => {
    expect(paginationRange(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('always keeps the first and last page reachable', () => {
    const range = paginationRange(50, 100);

    expect(range[0]).toBe(1);
    expect(range.at(-1)).toBe(100);
  });

  it('collapses the runs it skips', () => {
    expect(paginationRange(50, 100)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100]);
  });

  it('does not collapse a gap of one page', () => {
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles a single page', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
  });
});

describe('compareValues', () => {
  it('orders numbers numerically, not lexically', () => {
    expect(compareValues(9, 10)).toBeLessThan(0);
  });

  it('orders bigints past the float-safe range exactly', () => {
    expect(compareValues(9007199254740993n, 9007199254740992n)).toBeGreaterThan(0);
  });

  it('collates strings', () => {
    expect(compareValues('apple', 'banana')).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  const rows = [{ amount: 30n }, { amount: 10n }, { amount: 20n }];

  it('returns a sorted copy rather than mutating the array it was given', () => {
    const sorted = sortRows(rows, (row) => row.amount, 'asc');

    expect(sorted.map((row) => row.amount)).toEqual([10n, 20n, 30n]);
    expect(rows.map((row) => row.amount)).toEqual([30n, 10n, 20n]);
  });

  it('reverses for descending', () => {
    expect(sortRows(rows, (row) => row.amount, 'desc').map((row) => row.amount)).toEqual([
      30n,
      20n,
      10n,
    ]);
  });

  it('leaves rows untouched when the column has no sort value', () => {
    expect(sortRows(rows, undefined, 'asc')).toBe(rows);
  });
});

describe('initialsFrom', () => {
  it.each([
    ['James Mensah', 'JM'],
    ['acme ltd', 'AL'],
    ['Prince', 'P'],
    ['  spaced   out  ', 'SO'],
    ['Ana Maria de Souza', 'AM'],
  ])('turns %p into %p', (name, expected) => {
    expect(initialsFrom(name)).toBe(expected);
  });
});

describe('useToastQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues a toast and retires it after its duration', () => {
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.notify({ title: 'Payee added' });
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('keeps a zero-duration toast until it is dismissed', () => {
    const { result } = renderHook(() => useToastQueue());
    let id = '';

    act(() => {
      id = result.current.notify({ title: 'Card frozen', duration: 0 });
      jest.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 10);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('caps the queue so a retry loop cannot bury the page', () => {
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      for (let index = 0; index < MAX_VISIBLE_TOASTS * 3; index += 1) {
        result.current.notify({ title: `Attempt ${index}`, duration: 0 });
      }
    });

    expect(result.current.toasts).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(result.current.toasts.at(-1)?.title).toBe('Attempt 11');
  });

  it('cancels pending timers on unmount', () => {
    const { result, unmount } = renderHook(() => useToastQueue());

    act(() => {
      result.current.notify({ title: 'Payee added' });
    });
    unmount();

    expect(() => jest.runOnlyPendingTimers()).not.toThrow();
  });
});
