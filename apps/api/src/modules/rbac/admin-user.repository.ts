import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { type AdminUserDoc, AdminUserDocument } from './schemas/admin-user.schema.js';

/** Fields supplied when a staff account is created. */
export interface CreateAdminUserInput {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  grants?: string[];
  ipAllowlist?: string[];
  /** Already an Argon2id digest. Plaintext never reaches this layer. */
  passwordHash?: string | null;
  /** Already sealed by `SecretCipher`. */
  mfa?: { totpSecret: string; enrolledAt: Date };
}

/**
 * Projection that pulls the `select: false` credential fields back into a read.
 *
 * Named at the one call site that needs them keeps the default read shape safe:
 * everywhere else in the application, a staff document simply has no secrets on it.
 */
const WITH_CREDENTIALS = '+passwordHash +mfa.totpSecret';

/**
 * Persistence for `admin_users`.
 *
 * Services depend on this, never on the model — the same boundary every module here
 * keeps. The secrets-adjacent fields (`passwordHash`, `mfa.totpSecret`) are `select: false`
 * in the schema, so nothing returned from this repository carries them unless a caller
 * explicitly opts in, which only {@link AdminUserRepository.findCredentialsByEmail} does.
 */
@Injectable()
export class AdminUserRepository extends BaseRepository<AdminUserDocument> {
  constructor(@InjectModel(AdminUserDocument.name) model: Model<AdminUserDocument>) {
    super(model);
  }

  protected override get entityName(): string {
    return 'Admin user';
  }

  /** Looks an admin up by their public `adm_…` id. */
  async findByPublicId(id: string, session?: ClientSession): Promise<AdminUserDoc | null> {
    return this.findOne({ id }, session);
  }

  /** The login path's lookup. Email is stored lowercased, so callers pass it as typed. */
  async findByEmail(email: string, session?: ClientSession): Promise<AdminUserDoc | null> {
    return this.findOne({ email: email.toLowerCase() }, session);
  }

  /**
   * Reads a staff account *with* its password digest and TOTP seed, for a sign-in decision.
   *
   * Returns null for an unknown address rather than throwing: the login path must treat
   * "no such operator" and "wrong password" identically, and an exception here would fork
   * it into two measurably different code paths.
   */
  async findCredentialsByEmail(
    email: string,
    session?: ClientSession,
  ): Promise<AdminUserDoc | null> {
    return this.collection
      .findOne({ email: email.toLowerCase() })
      .select(WITH_CREDENTIALS)
      .session(session ?? null)
      .exec() as Promise<AdminUserDoc | null>;
  }

  /**
   * Spends a TOTP time step, atomically.
   *
   * The filter is the replay guard: it matches only while the stored step is behind the
   * presented one, so two requests carrying the same code race here and exactly one wins.
   * A read-then-write would let both through.
   */
  async claimTotpStep(id: string, timeStep: number, session?: ClientSession): Promise<boolean> {
    const claimed = await this.updateOne(
      {
        id,
        $or: [{ 'mfa.lastTimeStep': null }, { 'mfa.lastTimeStep': { $lt: timeStep } }],
      } as QueryFilter<AdminUserDocument>,
      { $set: { 'mfa.lastTimeStep': timeStep } },
      session,
    );
    return claimed !== null;
  }

  /** Creates a staff account. Duplicate email surfaces as a Mongo duplicate-key error. */
  async createAdmin(input: CreateAdminUserInput, session?: ClientSession): Promise<AdminUserDoc> {
    return this.create({ ...input, email: input.email.toLowerCase() }, session);
  }

  /** Stamps the simulated-clock login instant. */
  async recordLogin(id: string, at: Date, session?: ClientSession): Promise<void> {
    await this.updateOne({ id }, { $set: { lastLoginAt: at } }, session);
  }

  /** Deactivates a staff account. The guard rejects deactivated admins from then on. */
  async deactivate(id: string, session?: ClientSession): Promise<void> {
    await this.updateOne({ id }, { $set: { active: false } }, session);
  }

  /** Paginated staff listing for the admin console. */
  async listAll(params: {
    cursor?: string;
    limit: number;
  }): Promise<AdminUserDoc[]> {
    const filter: Record<string, unknown> = {};
    if (params.cursor) {
      filter['_id'] = { $gt: params.cursor };
    }
    return this.find(filter, { sort: { createdAt: -1 }, limit: params.limit }) as Promise<AdminUserDoc[]>;
  }
}
