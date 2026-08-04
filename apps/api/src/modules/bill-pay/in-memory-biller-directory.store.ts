import { Injectable } from '@nestjs/common';

import { type Biller } from '@reliance/contracts';

import { BillerDirectoryStore, type BillerQuery } from './biller-directory.store.js';

/**
 * An in-memory {@link BillerDirectoryStore}, loaded from whatever rows it is handed.
 *
 * The directory is static reference data, so the fake is a straightforward filter over a
 * frozen list — there is no concurrency to reproduce and nothing to get wrong. Its value is
 * that a payment test can name a real biller, with a real account-number pattern, without
 * standing up Mongo and running the seed first.
 */
@Injectable()
export class InMemoryBillerDirectoryStore extends BillerDirectoryStore {
  constructor(private readonly billers: readonly Biller[] = []) {
    super();
  }

  override async list(query: BillerQuery): Promise<{ billers: readonly Biller[]; total: number }> {
    const matching = this.billers.filter((biller) => matches(biller, query));

    return {
      billers: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
    };
  }

  override async findById(id: string): Promise<Biller | null> {
    return this.billers.find((biller) => biller.id === id) ?? null;
  }
}

function matches(biller: Biller, query: BillerQuery): boolean {
  if (!biller.active) return false;
  if (query.category && biller.category !== query.category) return false;
  if (!query.search) return true;

  return biller.name.toLowerCase().includes(query.search.toLowerCase());
}
