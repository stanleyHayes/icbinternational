import { Injectable } from '@nestjs/common';

import { type BulkTransfer } from '@reliance/contracts';

/**
 * In-memory bulk transfer store.
 *
 * Process-local (dev/demo). A production implementation would use MongoDB with a
 * `status` index and S3 for the uploaded CSV file.
 */
@Injectable()
export class BulkTransferStore {
  private readonly map = new Map<string, BulkTransfer>();

  insert(transfer: BulkTransfer): void {
    this.map.set(transfer.id, transfer);
  }

  findById(id: string): BulkTransfer | undefined {
    return this.map.get(id);
  }

  list(): BulkTransfer[] {
    return [...this.map.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  patch(id: string, fields: Partial<BulkTransfer>): BulkTransfer | null {
    const current = this.map.get(id);
    if (!current) return null;
    const updated = { ...current, ...fields };
    this.map.set(id, updated);
    return updated;
  }
}
