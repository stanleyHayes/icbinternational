/// <reference types="jest" />
/**
 * Saved views must survive a reload and must never stop the console rendering, whatever
 * is in storage — including something written by an older build.
 */

import {
  EMPTY_VIEW_STATE,
  loadSavedViews,
  loadWorkingState,
  matchesView,
  removeView,
  storeSavedViews,
  storeWorkingState,
  upsertView,
  type SavedView,
} from './saved-views';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    keys: () => [...data.keys()],
  };
}

const view: SavedView = {
  id: 'alerts:mine',
  name: 'My open alerts',
  savedAt: '2026-08-03T09:00:00.000Z',
  state: {
    filters: { status: 'OPEN', assignee: 'me' },
    sort: { columnId: 'raisedAt', direction: 'asc' },
    hiddenColumns: ['score'],
  },
};

describe('saved views round trip', () => {
  it('reads back what was written', () => {
    const storage = fakeStorage();
    storeSavedViews(storage, 'alerts', [view]);
    expect(loadSavedViews(storage, 'alerts')).toEqual([view]);
  });

  it('keeps each table separate', () => {
    const storage = fakeStorage();
    storeSavedViews(storage, 'alerts', [view]);
    expect(loadSavedViews(storage, 'approvals')).toEqual([]);
  });

  it('treats corrupt storage as no saved views', () => {
    const storage = fakeStorage({ 'rb.ops.v1.views.alerts': '{not json' });
    expect(loadSavedViews(storage, 'alerts')).toEqual([]);
  });

  it('drops entries written in an older shape rather than trusting them', () => {
    const storage = fakeStorage({ 'rb.ops.v1.views.alerts': '[{"name":"legacy"}]' });
    expect(loadSavedViews(storage, 'alerts')).toEqual([]);
  });
});

describe('working state', () => {
  it('remembers an arrangement that was never named', () => {
    const storage = fakeStorage();
    storeWorkingState(storage, 'alerts', view.state);
    expect(loadWorkingState(storage, 'alerts')).toEqual(view.state);
  });

  it('answers null when nothing has been stored', () => {
    expect(loadWorkingState(fakeStorage(), 'alerts')).toBeNull();
  });
});

describe('upsertView', () => {
  it('replaces a view of the same name rather than duplicating it', () => {
    const renamed: SavedView = {
      ...view,
      id: 'alerts:mine-2',
      savedAt: '2026-08-04T09:00:00.000Z',
    };
    expect(upsertView([view], renamed)).toEqual([renamed]);
  });

  it('keeps views with other names', () => {
    const other: SavedView = { ...view, id: 'alerts:all', name: 'Everything' };
    expect(upsertView([other], view)).toEqual([other, view]);
  });
});

describe('removeView', () => {
  it('removes by id', () => {
    expect(removeView([view], view.id)).toEqual([]);
  });
});

describe('matchesView', () => {
  it('recognises the arrangement the view describes', () => {
    expect(matchesView(view.state, view)).toBe(true);
  });

  it('rejects a different sort direction', () => {
    const flipped = { ...view.state, sort: { columnId: 'raisedAt', direction: 'desc' } } as const;
    expect(matchesView(flipped, view)).toBe(false);
  });

  it('rejects a different set of hidden columns', () => {
    expect(matchesView({ ...view.state, hiddenColumns: [] }, view)).toBe(false);
  });

  it('treats an absent filter and an empty one as the same', () => {
    const withEmpty = { ...view.state, filters: { ...view.state.filters, severity: '' } };
    expect(matchesView(withEmpty, view)).toBe(true);
  });

  it('rejects the empty arrangement against a filtered view', () => {
    expect(matchesView(EMPTY_VIEW_STATE, view)).toBe(false);
  });
});
