import { Injectable } from '@nestjs/common';

import { SeedWriter, type SeedDocument } from '../seed-writer.js';
import { LOCATIONS_COLLECTION } from '../seed.constants.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

import { LOCATION_DIRECTORY } from './locations/location-directory.js';

/**
 * Seeds the branch and ATM estate.
 *
 * `distanceMetres` is stored as null and populated per request by a proximity search —
 * a stored distance would be the distance from nowhere in particular.
 */
@Injectable()
export class LocationsSeeder implements Seeder {
  readonly name = 'locations';

  constructor(private readonly writer: SeedWriter) {}

  async run(): Promise<SeedOutcome> {
    const documents: SeedDocument[] = LOCATION_DIRECTORY.map((entry) => ({ ...entry }));

    return this.writer.sync({
      collection: LOCATIONS_COLLECTION,
      keyFields: ['id'],
      documents,
    });
  }
}
