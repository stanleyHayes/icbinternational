import { randomUUID } from 'node:crypto';

import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';

import {
  CustomerSegment,
  DocumentKind,
  ErrorCode,
  KycStatus,
  KycTier,
  type KycTier as KycTierType,
  type LimitMatrix,
} from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { UsersService, User, UserRepository } from '../../auth/users/index.js';
import { AssetPurpose, MediaStoragePort } from '../../files/index.js';
import { LimitsEngineService, type LimitCheckInput } from '../../limits/index.js';
import { LimitsModule } from '../../limits/index.js';
import { KycCaseRecord } from '../kyc-case.schema.js';
import { KycCaseService } from '../kyc-case.service.js';
import { KycDecisionService } from '../kyc-decision.service.js';
import { KycDocumentsService } from '../kyc-documents.service.js';
import { KycSubmissionService } from '../kyc-submission.service.js';
import { KycTierPort } from '../kyc-tier.port.js';
import { KycModule } from '../kyc.module.js';

/**
 * The acceptance proof, against a real replica set: a tier-0 customer is refused above
 * the tier-0 cap by the limits engine, and the same movement passes the moment a tier
 * upgrade decision lands. The tier reaches the engine through `KycTierPort` — the read
 * path this lane exports for exactly that purpose — so what is asserted here is the
 * whole chain: decision → case → customer record → tier read → limit check.
 */

process.env.NODE_ENV = 'test';
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27317/?replicaSet=rs0';
process.env.MONGODB_URI = MONGO_URI;
process.env.JWT_ACCESS_SECRET = 'kyc-integration-access-secret-0123456789ab';
process.env.JWT_REFRESH_SECRET = 'kyc-integration-refresh-secret-0123456789ab';
process.env.CSRF_SECRET = 'kyc-integration-csrf';
process.env.ENCRYPTION_KEY = 'kyc-integration-encryption-key-0123456';
process.env.SIM_SEED = 'kyc-integration';

jest.setTimeout(60_000);

const DB_NAME = 'reliancebank_kyc_test';
const NOW = new Date('2026-08-03T12:00:00.000Z');
const MONTH_MS = 30 * 24 * 3_600_000;
const MAX_VENDOR_RETRIES = 10;

/** £60: above the tier-0 £50 per-movement ceiling, comfortably inside tier 1 and 2. */
const ABOVE_TIER_ZERO = Money.fromMinor('6000', 'GBP');
const UNCAPPED_MATRIX: LimitMatrix = {
  perTransaction: null,
  daily: null,
  monthly: null,
  dailyCount: null,
};

/**
 * A placeholder in the hash column. These fixtures never sign in — the suite calls the
 * KYC services directly — so nothing ever verifies against it, and it is deliberately
 * not a real Argon2 digest so it cannot be mistaken for one.
 */
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- a fixture hash, never verified against.
const FIXTURE_PASSWORD_HASH = 'argon2id$placeholder-never-verified';

describe('KYC onboarding and the limits read path', () => {
  let moduleRef: TestingModule;
  let clock: ClockService;
  let users: UsersService;
  let userRecords: UserRepository;
  let cases: KycCaseService;
  let documents: KycDocumentsService;
  let submission: KycSubmissionService;
  let decision: KycDecisionService;
  let tier: KycTierPort;
  let engine: LimitsEngineService;
  let storage: MediaStoragePort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(MONGO_URI, { dbName: DB_NAME }),
        AppConfigModule,
        ClockModule,
        KycModule,
        LimitsModule,
      ],
    }).compile();

    clock = moduleRef.get(ClockService);
    users = moduleRef.get(UsersService);
    userRecords = moduleRef.get(UserRepository);
    cases = moduleRef.get(KycCaseService);
    documents = moduleRef.get(KycDocumentsService);
    submission = moduleRef.get(KycSubmissionService);
    decision = moduleRef.get(KycDecisionService);
    tier = moduleRef.get(KycTierPort);
    engine = moduleRef.get(LimitsEngineService);
    storage = moduleRef.get(MediaStoragePort);
    clock.freezeAt(NOW);

    await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();
    await moduleRef.get<Model<unknown>>(getModelToken(KycCaseRecord.name)).init();
    await moduleRef.get<Model<unknown>>(getModelToken(User.name)).init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('refuses tier 0 above its cap, and passes the same movement the moment tier 2 lands', async () => {
    const customer = await registerCustomer('upgrade');
    const movement = (): LimitCheckInput => ({
      accountId: `acc_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      scope: 'internalTransfer',
      matrix: UNCAPPED_MATRIX,
      kycTier: KycTier.TIER_0,
      currency: 'GBP',
    });

    // Tier 0: the cap is read fresh from the tier port, and £60 is above it.
    expect(await tier.tierOf(customer.id)).toBe(KycTier.TIER_0);
    const refused = await engine
      .check({ ...movement(), kycTier: await tier.tierOf(customer.id) }, ABOVE_TIER_ZERO)
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ code: ErrorCode.LIMIT_EXCEEDED });

    // A complete tier-2 file always lands with a human; the tier has not moved yet.
    await completeWizard(customer.id, KycTier.TIER_2);
    const submitted = await submission.submit(customer.id);
    expect(submitted.status).toBe(KycStatus.UNDER_REVIEW);
    expect(await tier.tierOf(customer.id)).toBe(KycTier.TIER_0);

    // The analyst approves: the movement the cap refused a moment ago now passes.
    const decided = await decision.decideForAdmin(
      submitted.id,
      { decision: 'APPROVE', tier: KycTier.TIER_2 },
      'adm_integration',
    );
    expect(decided.status).toBe(KycStatus.APPROVED);
    expect(decided.currentTier).toBe(KycTier.TIER_2);
    expect(decided.expiresAt?.toISOString()).toBe('2028-08-03T12:00:00.000Z');

    expect(await tier.tierOf(customer.id)).toBe(KycTier.TIER_2);
    expect((await userRecords.findById(customer.id))?.kycTier).toBe(KycTier.TIER_2);
    await expect(
      engine.check({ ...movement(), kycTier: await tier.tierOf(customer.id) }, ABOVE_TIER_ZERO),
    ).resolves.toBeDefined();

    // Twenty-five months later the approval has lapsed: the cap is back.
    clock.advance(25 * MONTH_MS);
    expect(await tier.tierOf(customer.id)).toBe(KycTier.TIER_0);
    expect((await userRecords.findById(customer.id))?.kycTier).toBe(KycTier.TIER_0);
    const expired = await engine
      .check({ ...movement(), kycTier: await tier.tierOf(customer.id) }, ABOVE_TIER_ZERO)
      .catch((error: unknown) => error);
    expect(expired).toMatchObject({ code: ErrorCode.LIMIT_EXCEEDED });

    const after = await cases.getStatus(customer.id);
    expect(after.status).toBe(KycStatus.EXPIRED);
  });

  it('auto-approves a clean tier 1 file and lifts the cap immediately', async () => {
    const customer = await registerCustomer('auto');

    await completeWizard(customer.id, KycTier.TIER_1);
    const submitted = await submission.submit(customer.id);

    expect(submitted.status).toBe(KycStatus.APPROVED);
    expect(submitted.currentTier).toBe(KycTier.TIER_1);
    expect(await tier.tierOf(customer.id)).toBe(KycTier.TIER_1);
  });

  it('refuses to submit while steps are outstanding, naming what is missing', async () => {
    const customer = await registerCustomer('incomplete');
    await cases.start(customer.id, KycTier.TIER_1);

    const refusal = await submission.submit(customer.id).catch((error: unknown) => error);

    expect(refusal).toMatchObject({ code: ErrorCode.PRECONDITION_FAILED });
  });

  // --- Helpers -------------------------------------------------------------

  async function registerCustomer(suffix: string) {
    return users.createCustomer({
      email: `kyc-${suffix}-${randomUUID().slice(0, 8)}@example.com`,
      passwordHash: FIXTURE_PASSWORD_HASH,
      firstName: 'Test',
      lastName: 'Customer',
      segment: CustomerSegment.PERSONAL,
      locale: 'en-GB',
      baseCurrency: 'GBP',
      marketingOptIn: false,
    });
  }

  /** Walks the whole wizard for a customer: every step answered, every document in. */
  async function completeWizard(userId: string, requestedTier: KycTierType) {
    await cases.start(userId, requestedTier);
    await cases.submitStep(userId, {
      step: 'IDENTITY',
      dateOfBirth: '1990-04-10',
      nationality: 'GB',
    });
    await cases.submitStep(userId, {
      step: 'ADDRESS',
      address: { line1: '1 High Street', city: 'London', postalCode: 'E1 6AN', country: 'GB' },
    });
    await cases.submitStep(userId, {
      step: 'EMPLOYMENT',
      employmentStatus: 'EMPLOYED',
      occupation: 'Engineer',
      employerName: 'Example Ltd',
    });
    await cases.submitStep(userId, { step: 'SOURCE_OF_FUNDS', sourceOfFunds: 'SALARY' });

    await attachVerified(userId, DocumentKind.PASSPORT, 'passport.pdf', 'application/pdf');
    if (requestedTier >= KycTier.TIER_2) {
      await attachVerified(
        userId,
        DocumentKind.PROOF_OF_ADDRESS,
        'statement.pdf',
        'application/pdf',
      );
    }
    await cases.submitStep(userId, { step: 'DOCUMENTS' });
    await passLiveness(userId);
  }

  /** Attaches an artefact, retrying with a fresh upload if the OCR draw comes back cold. */
  async function attachVerified(
    userId: string,
    kind: (typeof DocumentKind)[keyof typeof DocumentKind],
    fileName: string,
    contentType: string,
  ) {
    for (let attempt = 0; attempt < MAX_VENDOR_RETRIES; attempt += 1) {
      const document = await attachOnce(userId, kind, fileName, contentType);
      if (document.verified || document.ocr === null) return;
      // An unreadable capture would sit on the case as unverified evidence; take it off.
      await documents.remove(userId, document.id);
    }
    throw new Error('OCR never accepted the fixture artefact');
  }

  async function attachOnce(
    userId: string,
    kind: (typeof DocumentKind)[keyof typeof DocumentKind],
    fileName: string,
    contentType: string,
  ) {
    const stored = await storage.upload({
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      ownerRef: userId,
      fileName,
      contentType,
      bytes: new TextEncoder().encode(`fixture bytes for ${fileName} ${randomUUID()}`),
    });
    return documents.attach({ userId, kind, assetId: stored.storageKey, fileName });
  }

  /** Submits the LIVENESS step, retaking the selfie until the vendor says LIVE. */
  async function passLiveness(userId: string) {
    for (let attempt = 0; attempt < MAX_VENDOR_RETRIES; attempt += 1) {
      const selfie = await attachOnce(userId, DocumentKind.SELFIE, 'selfie.jpg', 'image/jpeg');
      const outcome = await cases
        .submitStep(userId, { step: 'LIVENESS', selfieDocumentId: selfie.id })
        .catch((error: unknown) => error);
      if (!(outcome instanceof Error)) return;
      expect(outcome).toMatchObject({ code: ErrorCode.KYC_DOCUMENT_INVALID });
    }
    throw new Error('Liveness never accepted the fixture selfie');
  }
});
