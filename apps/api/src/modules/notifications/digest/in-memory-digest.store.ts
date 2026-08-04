import { Injectable } from '@nestjs/common';

import { DigestStore, type DigestBucket, type DigestItem } from './digest.store.js';

/** In-process digest buckets, with the same fixed-window semantics as the repository. */
@Injectable()
export class InMemoryDigestStore extends DigestStore {
  private readonly byUser = new Map<string, DigestBucket>();

  override async append(input: {
    userId: string;
    item: DigestItem;
    dueAt: Date;
  }): Promise<DigestBucket> {
    const existing = this.byUser.get(input.userId);

    const bucket: DigestBucket = existing
      ? { ...existing, items: [...existing.items, input.item] }
      : {
          userId: input.userId,
          items: [input.item],
          dueAt: input.dueAt,
          openedAt: input.item.at,
        };

    this.byUser.set(input.userId, bucket);
    return bucket;
  }

  override async findOpen(userId: string): Promise<DigestBucket | null> {
    return this.byUser.get(userId) ?? null;
  }

  override async findDue(now: Date, limit: number): Promise<DigestBucket[]> {
    return [...this.byUser.values()]
      .filter((bucket) => bucket.dueAt.getTime() <= now.getTime())
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())
      .slice(0, limit);
  }

  override async clear(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}
