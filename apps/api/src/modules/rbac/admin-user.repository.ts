import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

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
}

/**
 * Persistence for `admin_users`.
 *
 * Services depend on this, never on the model — the same boundary every module here
 * keeps. The secrets-adjacent field (`mfa.totpSecret`) is `select: false` in the schema,
 * so nothing returned from this repository carries it unless a caller explicitly opts in,
 * which only A-05's TOTP flow should.
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
}
