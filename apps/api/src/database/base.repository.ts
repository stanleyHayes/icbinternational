import { NotFoundException } from '@nestjs/common';
import {
  type ClientSession,
  type HydratedDocument,
  type Model,
  type ProjectionType,
  type QueryFilter,
  type UpdateQuery,
} from 'mongoose';

/**
 * Thin repository base.
 *
 * Services depend on repositories, never on Mongoose models — that boundary is what lets
 * the domain layer stay framework-free and unit-testable without a database. The base
 * stays deliberately thin: it removes the ceremony of threading a session through every
 * call, and adds nothing that would tempt a caller to smuggle query logic into a service.
 *
 * Every method takes an optional `ClientSession`. Passing it is not optional in practice:
 * a read inside a money transaction that forgets the session reads outside the snapshot,
 * and can produce a decision based on a balance that no longer exists.
 */
export abstract class BaseRepository<TDocument> {
  protected constructor(protected readonly model: Model<TDocument>) {}

  /** Name used in "not found" messages. Defaults to the model name. */
  protected get entityName(): string {
    return this.model.modelName;
  }

  async findById(id: string, session?: ClientSession): Promise<HydratedDocument<TDocument> | null> {
    return this.findOne({ id } as QueryFilter<TDocument>, session);
  }

  /** Like {@link findById} but throws rather than returning null. */
  async findByIdOrFail(id: string, session?: ClientSession): Promise<HydratedDocument<TDocument>> {
    const document = await this.findById(id, session);
    if (!document) throw new NotFoundException(`${this.entityName} ${id} was not found`);
    return document;
  }

  async findOne(
    filter: QueryFilter<TDocument>,
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument> | null> {
    return this.model
      .findOne(filter)
      .session(session ?? null)
      .exec() as Promise<HydratedDocument<TDocument> | null>;
  }

  async find(
    filter: QueryFilter<TDocument>,
    options: FindOptions<TDocument> = {},
  ): Promise<HydratedDocument<TDocument>[]> {
    const query = this.model.find(filter, options.projection).session(options.session ?? null);
    if (options.sort) query.sort(options.sort);
    if (options.skip) query.skip(options.skip);
    if (options.limit) query.limit(options.limit);
    return query.exec() as Promise<HydratedDocument<TDocument>[]>;
  }

  async exists(filter: QueryFilter<TDocument>, session?: ClientSession): Promise<boolean> {
    const found = await this.model
      .exists(filter)
      .session(session ?? null)
      .exec();
    return found !== null;
  }

  async count(filter: QueryFilter<TDocument>, session?: ClientSession): Promise<number> {
    return this.model
      .countDocuments(filter)
      .session(session ?? null)
      .exec();
  }

  async create(data: CreateInput, session?: ClientSession): Promise<HydratedDocument<TDocument>> {
    const [created] = await this.createMany([data], session);
    if (!created) throw new Error(`Failed to create ${this.entityName}`);
    return created;
  }

  async createMany(
    records: CreateInput[],
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument>[]> {
    if (records.length === 0) return [];
    // Mongoose's create() overloads cannot express "a partial of the raw doc type" for a
    // generic TDocument. The concrete repository owns the field-level typing; this base
    // only guarantees the session and return shape.
    const created = await this.model.create(records as never[], { session: session ?? undefined });
    return created as HydratedDocument<TDocument>[];
  }

  async updateById(
    id: string,
    update: UpdateQuery<TDocument>,
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument> | null> {
    return this.updateOne({ id } as QueryFilter<TDocument>, update, session);
  }

  async updateOne(
    filter: QueryFilter<TDocument>,
    update: UpdateQuery<TDocument>,
    session?: ClientSession,
  ): Promise<HydratedDocument<TDocument> | null> {
    return this.model
      .findOneAndUpdate(filter, update, { new: true, session: session ?? null })
      .exec() as Promise<HydratedDocument<TDocument> | null>;
  }

  async updateMany(
    filter: QueryFilter<TDocument>,
    update: UpdateQuery<TDocument>,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model
      .updateMany(filter, update, { session: session ?? undefined })
      .exec();
    return result.modifiedCount;
  }

  async deleteById(id: string, session?: ClientSession): Promise<boolean> {
    const result = await this.model
      .deleteOne({ id } as QueryFilter<TDocument>, { session: session ?? undefined })
      .exec();
    return result.deletedCount > 0;
  }

  /**
   * Escape hatch for aggregations, bulk writes and index management.
   *
   * `protected`, so it is available to a concrete repository that genuinely needs the
   * driver and unreachable from a service — which is the point.
   */
  protected get collection(): Model<TDocument> {
    return this.model;
  }
}

export interface FindOptions<TDocument> {
  session?: ClientSession;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  projection?: ProjectionType<TDocument>;
}

/**
 * Fields supplied when creating a document.
 *
 * Mongoose fills `_id` and the timestamps, so callers pass domain fields only. Concrete
 * repositories narrow this to their own schema type at the call site.
 */
export type CreateInput = Record<string, unknown>;
