import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { type RoleDoc, RoleDocument } from './schemas/role.schema.js';

/**
 * Persistence for the `roles` mirror.
 *
 * Deliberately minimal: the catalogue sync upserts whole rows, the console reads them
 * back. There is no partial update — a role's bundle is defined in code and restated
 * here, so the only write that makes sense is "make this row match the catalogue".
 */
@Injectable()
export class RoleRepository extends BaseRepository<RoleDocument> {
  constructor(@InjectModel(RoleDocument.name) model: Model<RoleDocument>) {
    super(model);
  }

  protected override get entityName(): string {
    return 'Role';
  }

  /** Inserts or fully restates one catalogue row, keyed by role name. */
  async upsertCatalogueRow(row: {
    id: string;
    name: string;
    description: string;
    permissions: readonly string[];
  }): Promise<void> {
    await this.collection
      .updateOne(
        { name: row.name },
        { $set: { id: row.id, description: row.description, permissions: [...row.permissions] } },
        { upsert: true },
      )
      .exec();
  }

  /** Every catalogue row, sorted by name for a stable console listing. */
  async listAll(): Promise<RoleDoc[]> {
    return this.find({}, { sort: { name: 1 } });
  }
}
