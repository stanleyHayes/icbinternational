import { diffSnapshots, flattenSnapshot } from '../audit-diff.js';

describe('flattenSnapshot', () => {
  it('flattens nested objects to dotted paths', () => {
    const flat = flattenSnapshot({
      status: 'ACTIVE',
      holder: { name: 'Grace', address: { city: 'London' } },
    });

    expect(flat.get('status')).toBe('ACTIVE');
    expect(flat.get('holder.name')).toBe('Grace');
    expect(flat.get('holder.address.city')).toBe('London');
  });

  it('keeps arrays whole, so a reorder does not look like a wall of edits', () => {
    const flat = flattenSnapshot({ tags: ['a', 'b'] });

    expect(flat.get('tags')).toBe('["a","b"]');
    expect(flat.has('tags.0')).toBe(false);
  });

  it('serialises dates, numbers, booleans and nulls to their recorded form', () => {
    const flat = flattenSnapshot({
      at: new Date('2026-01-01T00:00:00.000Z'),
      count: 3,
      active: false,
      note: null,
    });

    expect(flat.get('at')).toBe('2026-01-01T00:00:00.000Z');
    expect(flat.get('count')).toBe('3');
    expect(flat.get('active')).toBe('false');
    expect(flat.get('note')).toBeNull();
  });

  it('stops descending past the depth ceiling and stores the rest as JSON', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } };
    const flat = flattenSnapshot(deep);

    expect(flat.get('a.b.c.d.e')).toBe('{"f":"too deep"}');
    expect(flat.has('a.b.c.d.e.f')).toBe(false);
  });
});

describe('diffSnapshots', () => {
  it('records only the fields that moved', () => {
    const changes = diffSnapshots(
      { status: 'ACTIVE', tier: 'GOLD' },
      { status: 'FROZEN', tier: 'GOLD' },
    );

    expect(changes).toEqual([{ field: 'status', before: 'ACTIVE', after: 'FROZEN' }]);
  });

  it('records a creation as changes against null', () => {
    const changes = diffSnapshots(null, { status: 'ACTIVE' });

    expect(changes).toEqual([{ field: 'status', before: null, after: 'ACTIVE' }]);
  });

  it('records a deletion as changes to null', () => {
    const changes = diffSnapshots({ status: 'ACTIVE' }, null);

    expect(changes).toEqual([{ field: 'status', before: 'ACTIVE', after: null }]);
  });

  it('treats 1 and "1" as equal — the recorded form is what matters', () => {
    expect(diffSnapshots({ count: 1 }, { count: '1' })).toEqual([]);
  });

  it('returns an empty diff for identical snapshots', () => {
    expect(diffSnapshots({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
