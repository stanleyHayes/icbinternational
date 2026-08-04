import { type User as UserView } from '@reliance/contracts';

import { type UserDocument } from './schemas/user.schema.js';

/**
 * Projects a stored user onto the contract view.
 *
 * This function is the boundary that keeps credentials inside the server. It builds the
 * response field by field rather than spreading the document, so a new secret column added
 * to the schema tomorrow cannot appear in an API response by default — it has to be added
 * here deliberately.
 */
export function toUserView(user: UserDocument): UserView {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    segment: user.segment,
    kycTier: user.kycTier,
    mfaEnabled: user.mfa.enrolled,
    mfaMethods: user.mfa.enrolled ? [...user.mfa.methods] : [],
    locale: user.locale,
    baseCurrency: user.baseCurrency,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
