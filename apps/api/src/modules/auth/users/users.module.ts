import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../../common/ids/id-generator.js';

import { User, UserSchema } from './schemas/user.schema.js';
import { UserRepository } from './user.repository.js';
import { UsersService } from './users.service.js';

/**
 * Customer identity.
 *
 * Exports the repository as well as the service because the auth module's MFA code owns
 * the `user.mfa` sub-document outright; routing those writes through a pass-through method
 * on `UsersService` would add indirection without adding a rule.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService, UserRepository, IdGenerator],
  exports: [UsersService, UserRepository, MongooseModule],
})
export class UsersModule {}
