import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, type UpdateQuery } from 'mongoose';

import { BaseRepository } from '../../../database/base.repository.js';

import { User, type UserDocument } from './schemas/user.schema.js';

/**
 * Projection that pulls the `select: false` credential fields back into a read.
 *
 * Naming them at exactly the two call sites that need them keeps the default read shape
 * safe: everywhere else in the application, a user document simply has no hash on it.
 */
const WITH_SECRETS = '+passwordHash +mfa.totpSecret +mfa.recoveryCodeHashes';

/** Persistence for the `users` collection. */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(@InjectModel(User.name) model: Model<User>) {
    super(model);
  }

  /**
   * Paginates all customers for the admin console's customer list.
   *
   * Cursor is the customer's `id` field. Results are ordered by `createdAt DESC`
   * so newer sign-ups appear first.
   */
  async listPaginated(query: AdminCustomerQuery): Promise<UserDocument[]> {
    const filter: QueryFilter<User> = query.cursor ? ({ id: { $lt: query.cursor } } as QueryFilter<User>) : {};
    return this.find(filter, { sort: { createdAt: -1 }, limit: query.limit }) as Promise<UserDocument[]>;
  }

  /**
   * Reads a user without any credential material.
   *
   * @param email Already normalised to lower case by the contract schema.
   */
  async findByEmail(email: string, session?: ClientSession): Promise<UserDocument | null> {
    return this.findOne({ email } as QueryFilter<User>, session);
  }

  /**
   * Reads a user *with* password hash and MFA secrets, for an authentication decision.
   *
   * Returns null for an unknown address rather than throwing: the login path must treat
   * "no such user" and "wrong password" identically, and an exception here would fork it.
   */
  async findCredentialsByEmail(
    email: string,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.selectWithSecrets({ email } as QueryFilter<User>, session);
  }

  /** As {@link findCredentialsByEmail}, keyed by public id. */
  async findCredentialsById(id: string, session?: ClientSession): Promise<UserDocument | null> {
    return this.selectWithSecrets({ id } as QueryFilter<User>, session);
  }

  /**
   * Applies an update and returns the new document, still without secrets.
   *
   * Every mutation goes through `findOneAndUpdate` rather than `document.save()` so that
   * concurrent writes to unrelated fields — a login timestamp and an MFA enrolment, say —
   * cannot lose each other to a stale in-memory copy.
   */
  async patch(
    id: string,
    update: UpdateQuery<User>,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.updateById(id, update, session) as Promise<UserDocument | null>;
  }

  /**
   * Inserts a user, reporting which unique index rejected it rather than throwing.
   *
   * The unique indexes on `email` and `phone` are the only race-proof check available: a
   * "does this address exist" query followed by an insert has a window between the two,
   * and two simultaneous sign-ups would both pass through it.
   */
  async insertUnique(data: Record<string, unknown>): Promise<InsertUserResult> {
    try {
      return { user: (await this.create(data)) as UserDocument };
    } catch (error) {
      const conflictOn = duplicateKeyField(error);
      if (!conflictOn) throw error;
      return { conflictOn };
    }
  }

  private async selectWithSecrets(
    filter: QueryFilter<User>,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.collection
      .findOne(filter)
      .select(WITH_SECRETS)
      .session(session ?? null)
      .exec() as Promise<UserDocument | null>;
  }
}

/** Outcome of an insert guarded by the collection's unique indexes. */
export type InsertUserResult =
  | { user: UserDocument; conflictOn?: never }
  | { user?: never; conflictOn: UniqueUserField };

/** The fields a sign-up can collide on. */
export type UniqueUserField = 'email' | 'phone';

/** Admin-side paginated customer query (no userId scope). */
export interface AdminCustomerQuery {
  readonly cursor?: string;
  readonly limit: number;
}

const DUPLICATE_KEY_CODE = 11_000;

/**
 * Identifies which unique index a write violated.
 *
 * MongoDB reports every unique-index violation as error code 11000 and names the offending
 * index in `keyPattern`, which is how the caller can say "that email is taken" instead of
 * the useless "conflict".
 */
function duplicateKeyField(error: unknown): UniqueUserField | null {
  if (typeof error !== 'object' || error === null) return null;
  if ((error as { code?: unknown }).code !== DUPLICATE_KEY_CODE) return null;

  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return 'phone' in pattern ? 'phone' : 'email';
}
