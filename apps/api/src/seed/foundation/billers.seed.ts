import { Injectable } from '@nestjs/common';

import { SeedWriter, type SeedDocument } from '../seed-writer.js';
import { BILLERS_COLLECTION } from '../seed.constants.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

import { BILLER_DIRECTORY } from './billers/biller-directory.js';

/**
 * Seeds the bill-payment directory.
 *
 * Keyed on the biller's slug rather than a generated identifier. A slug is stable across
 * environments, which means a persona's standing order to `thames-water` refers to the
 * same biller after a database reset — and a fixture written today still resolves next
 * month.
 */
@Injectable()
export class BillersSeeder implements Seeder {
  readonly name = 'billers';

  constructor(private readonly writer: SeedWriter) {}

  async run(): Promise<SeedOutcome> {
    const documents: SeedDocument[] = BILLER_DIRECTORY.map((entry) => ({ ...entry }));

    return this.writer.sync({
      collection: BILLERS_COLLECTION,
      keyFields: ['id'],
      documents,
    });
  }
}
