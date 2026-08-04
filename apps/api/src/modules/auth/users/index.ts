/**
 * Public surface of the users module.
 *
 * Other feature modules need a customer's identity constantly — an account belongs to one,
 * a transfer is initiated by one. They import from here so that the schema file, the
 * repository internals and the credential projection stay private to this folder.
 */
export { UsersModule } from './users.module.js';
export { UsersService, type CreateUserInput, type LockoutPolicy } from './users.service.js';
export { UserRepository, type InsertUserResult, type UniqueUserField } from './user.repository.js';
export { toUserView } from './user.mapper.js';
export { User, UserSchema, UserMfa, type UserDocument } from './schemas/user.schema.js';
