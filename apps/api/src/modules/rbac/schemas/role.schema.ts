import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS } from '../../../database/schema.helpers.js';
import { ROLE_COLLECTION } from '../rbac.constants.js';

/**
 * One row of the role catalogue, mirrored from `role-catalog.ts`.
 *
 * The mirror exists for readers, not for enforcement: the operations console lists roles
 * and their bundles from this collection, while authorisation resolves against the code
 * map. `RoleSyncService` upserts from the catalogue, so the row's `permissions` can only
 * ever restate what the code already grants.
 *
 * The public id is deterministic (`rol_support_agent`), which makes the sync idempotent
 * by construction rather than by a find-then-insert race.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: ROLE_COLLECTION })
export class RoleDocument {
  @Prop({ type: String, required: true, unique: true, immutable: true, index: true })
  id!: string;

  /**
   * Contract `AdminRole` value; also the natural key the sync upserts on.
   *
   * Uniqueness is declared once, on the named index below. Declaring it here as well
   * asked Mongo to build the same key twice under two names, which it refuses — and the
   * refusal only surfaces when something actually waits for the index build.
   */
  @Prop({ type: String, required: true, immutable: true })
  name!: string;

  @Prop({ type: String, required: true })
  description!: string;

  /** Contract `Permission` values, verbatim from the code catalogue. */
  @Prop({ type: [String], required: true, default: [] })
  permissions!: string[];
}

export type RoleDoc = HydratedDocument<RoleDocument>;

export const RoleSchema = SchemaFactory.createForClass(RoleDocument);

RoleSchema.index({ name: 1 }, { unique: true, name: 'role_name_unique' });
