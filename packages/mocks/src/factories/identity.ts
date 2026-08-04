/**
 * Identity fixtures: users, profiles, sessions, devices, passkeys and KYC cases.
 *
 * Every factory takes an `overrides` bag and merges it last, so a test can pin the one
 * field it cares about — `makeUser({ status: 'LOCKED' })` — without restating a User.
 */

import type { Passkey } from '@reliance/api-client';
import {
  CustomerSegment,
  DocumentKind,
  EmploymentStatus,
  KycStatus,
  MfaMethod,
  RiskRating,
  SourceOfFunds,
  UserStatus,
  type Address,
  type CustomerDocument,
  type Device,
  type KycCase,
  type Profile,
  type Session,
  type User,
} from '@reliance/contracts';

import type { MockClock } from '../db/clock.js';
import { money } from '../db/money.js';
import { faker, mockId, opaqueId, pickEnum, pickOne, postcode } from '../faker.js';

/** Options shared by every factory: a clock, plus field overrides. */
export interface FactoryOptions<T> {
  readonly clock: MockClock;
  readonly overrides?: Partial<T>;
}

/** A customer. */
export function makeUser(options: FactoryOptions<User>): User {
  const { clock, overrides } = options;
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  return {
    id: mockId('usr'),
    email: faker.internet.email({ firstName, lastName, provider: 'example.com' }).toLowerCase(),
    emailVerified: true,
    phone: `+4477009${faker.string.numeric(5)}`,
    phoneVerified: true,
    firstName,
    lastName,
    status: UserStatus.ACTIVE,
    segment: CustomerSegment.PERSONAL,
    kycTier: 2,
    mfaEnabled: true,
    mfaMethods: [MfaMethod.TOTP],
    locale: 'en-GB',
    baseCurrency: 'GBP',
    avatarUrl: null,
    createdAt: clock.daysAgo(faker.number.int({ min: 200, max: 900 })),
    lastLoginAt: clock.daysAgo(0),
    ...overrides,
  };
}

/** A postal address. */
export function makeAddress(overrides?: Partial<Address>): Address {
  return {
    line1: faker.location.streetAddress(),
    city: faker.location.city(),
    postalCode: postcode(),
    country: 'GB',
    ...overrides,
  };
}

/** A customer profile. */
export function makeProfile(options: FactoryOptions<Profile> & { userId: string }): Profile {
  const { clock, overrides, userId } = options;

  return {
    userId,
    dateOfBirth: faker.date
      .birthdate({ min: 21, max: 68, mode: 'age', refDate: new Date(clock.nowMs()) })
      .toISOString()
      .slice(0, 10),
    nationality: 'GB',
    address: makeAddress(),
    employmentStatus: EmploymentStatus.EMPLOYED,
    occupation: faker.person.jobTitle(),
    employerName: faker.company.name(),
    annualIncome: money(faker.number.int({ min: 2_800_000, max: 12_000_000 })),
    sourceOfFunds: SourceOfFunds.SALARY,
    taxResidency: 'GB',
    updatedAt: clock.daysAgo(faker.number.int({ min: 1, max: 90 })),
    ...overrides,
  };
}

/** A live session. */
export function makeSession(options: FactoryOptions<Session>): Session {
  const { clock, overrides } = options;

  return {
    id: mockId('ses'),
    current: false,
    deviceLabel: pickOne(['MacBook Pro', 'iPhone 17', 'Pixel 10', 'iPad Air', 'Windows Laptop']),
    ipAddress: faker.internet.ipv4(),
    location: `${faker.location.city()}, United Kingdom`,
    userAgent: faker.internet.userAgent(),
    createdAt: clock.daysAgo(faker.number.int({ min: 0, max: 14 })),
    lastSeenAt: clock.daysAgo(0),
    expiresAt: clock.daysAhead(30),
    ...overrides,
  };
}

/** A recognised device. */
export function makeDevice(options: FactoryOptions<Device>): Device {
  const { clock, overrides } = options;

  return {
    id: mockId('dev'),
    label: pickOne(['MacBook Pro', 'iPhone 17', 'Pixel 10', 'iPad Air']),
    platform: pickOne(['macOS', 'iOS', 'Android', 'Windows']),
    trust: 'TRUSTED',
    hasPasskey: faker.datatype.boolean(),
    firstSeenAt: clock.daysAgo(faker.number.int({ min: 30, max: 400 })),
    lastSeenAt: clock.daysAgo(faker.number.int({ min: 0, max: 5 })),
    ...overrides,
  };
}

/** A registered passkey. */
export function makePasskey(options: FactoryOptions<Passkey>): Passkey {
  const { clock, overrides } = options;

  return {
    id: opaqueId(),
    label: pickOne(['iCloud Keychain', 'YubiKey 5C', 'Google Password Manager']),
    deviceLabel: pickOne(['MacBook Pro', 'iPhone 17']),
    aaguid: faker.string.uuid(),
    backedUp: true,
    lastUsedAt: clock.daysAgo(faker.number.int({ min: 0, max: 20 })),
    createdAt: clock.daysAgo(faker.number.int({ min: 30, max: 300 })),
    ...overrides,
  };
}

/** A KYC document. */
export function makeDocument(options: FactoryOptions<CustomerDocument>): CustomerDocument {
  const { clock, overrides } = options;
  const kind = pickEnum(DocumentKind);

  return {
    id: mockId('doc'),
    kind,
    fileName: `${kind.toLowerCase()}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: faker.number.int({ min: 120_000, max: 4_000_000 }),
    previewUrl: `https://assets.reliance.test/kyc/${opaqueId()}`,
    uploadedAt: clock.daysAgo(faker.number.int({ min: 1, max: 120 })),
    verified: true,
    ...overrides,
  };
}

/** An approved KYC case — the state most screens want to render against. */
export function makeKycCase(options: FactoryOptions<KycCase> & { userId: string }): KycCase {
  const { clock, overrides, userId } = options;

  return {
    id: mockId('kyc'),
    userId,
    status: KycStatus.APPROVED,
    currentTier: 2,
    requestedTier: 2,
    completedSteps: ['IDENTITY', 'ADDRESS', 'EMPLOYMENT', 'SOURCE_OF_FUNDS', 'DOCUMENTS'],
    nextStep: null,
    documents: [
      makeDocument({ clock, overrides: { kind: DocumentKind.PASSPORT } }),
      makeDocument({ clock, overrides: { kind: DocumentKind.PROOF_OF_ADDRESS } }),
    ],
    riskRating: RiskRating.LOW,
    reviewerMessage: null,
    submittedAt: clock.daysAgo(180),
    decidedAt: clock.daysAgo(179),
    expiresAt: clock.daysAhead(545),
    createdAt: clock.daysAgo(181),
    updatedAt: clock.daysAgo(179),
    ...overrides,
  };
}
