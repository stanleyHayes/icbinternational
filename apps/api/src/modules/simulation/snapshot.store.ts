/**
 * In-memory snapshot store for the simulation clock.
 *
 * Snapshots capture the clock's offset and frozen-at state so a scenario can be
 * rewound. They are process-local — a restart clears them — which is fine for
 * a development tool.
 */

export interface ClockSnapshot {
  readonly id: string;
  readonly label: string;
  readonly offsetMs: number;
  readonly frozenAt: string | null;
  readonly createdAt: string;
}

export class SnapshotStore {
  private readonly store = new Map<string, ClockSnapshot>();

  save(snapshot: ClockSnapshot): void {
    this.store.set(snapshot.id, snapshot);
  }

  list(): ClockSnapshot[] {
    return [...this.store.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  find(id: string): ClockSnapshot | null {
    return this.store.get(id) ?? null;
  }

  delete(id: string): void {
    this.store.delete(id);
  }
}
