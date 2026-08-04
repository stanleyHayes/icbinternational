/**
 * Bulk selection, and the rule that keeps it safe.
 *
 * The behaviour worth testing is not "a checkbox toggles". It is that a row which has
 * fallen out of the filtered queue is no longer part of the selection — because a bulk
 * decision applied to a row the operator can no longer see is the failure this hook exists
 * to prevent.
 */

import { act, renderHook } from '@testing-library/react';

import { useSelection } from './use-selection';

const VISIBLE = ['kyc_a', 'kyc_b', 'kyc_c'];

describe('useSelection', () => {
  it('starts with nothing chosen', () => {
    const { result } = renderHook(() => useSelection(VISIBLE));

    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
  });

  it('toggles one row on and off again', () => {
    const { result } = renderHook(() => useSelection(VISIBLE));

    act(() => result.current.toggle('kyc_b'));
    expect(result.current.ids).toEqual(['kyc_b']);
    expect(result.current.someSelected).toBe(true);

    act(() => result.current.toggle('kyc_b'));
    expect(result.current.count).toBe(0);
  });

  it('selects every visible row, then clears them all on a second press', () => {
    const { result } = renderHook(() => useSelection(VISIBLE));

    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(VISIBLE.length);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it('drops a chosen row once it leaves the filtered queue', () => {
    const { rerender, result } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: VISIBLE },
    });

    act(() => result.current.toggle('kyc_c'));
    expect(result.current.ids).toEqual(['kyc_c']);

    rerender({ ids: ['kyc_a', 'kyc_b'] });

    expect(result.current.ids).toEqual([]);
    expect(result.current.isSelected('kyc_c')).toBe(false);
  });

  it('clears everything on request', () => {
    const { result } = renderHook(() => useSelection(VISIBLE));

    act(() => result.current.toggleAll());
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
  });
});
