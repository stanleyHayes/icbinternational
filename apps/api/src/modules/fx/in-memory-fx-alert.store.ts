import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { FxAlertStore, type FxAlertRecord, type NewFxAlert } from './fx-alert.store.js';

/**
 * An honest, in-memory {@link FxAlertStore}.
 *
 * {@link markTriggered} reads and writes with no `await` between them, reproducing the
 * conditional update the repository relies on. Two overlapping sweeps must not both notify
 * a customer about one crossing, and a fake that let them would make that test vacuous.
 */
@Injectable()
export class InMemoryFxAlertStore extends FxAlertStore {
  private readonly byId = new Map<string, FxAlertRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(alert: NewFxAlert): Promise<FxAlertRecord> {
    const record: FxAlertRecord = {
      ...alert,
      id: this.ids.generate('alert'),
      active: true,
      triggeredAt: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async listByUser(userId: string): Promise<readonly FxAlertRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  override async findById(id: string, userId: string): Promise<FxAlertRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async remove(id: string, userId: string): Promise<FxAlertRecord | null> {
    const record = await this.findById(id, userId);
    if (record) this.byId.delete(id);
    return record;
  }

  override async listArmed(limit: number): Promise<readonly FxAlertRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.active)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(0, limit);
  }

  override async markTriggered(id: string, at: Date): Promise<FxAlertRecord | null> {
    const record = this.byId.get(id);
    if (!record || !record.active) return null;

    const fired: FxAlertRecord = { ...record, active: false, triggeredAt: at };
    this.byId.set(id, fired);
    return fired;
  }
}
