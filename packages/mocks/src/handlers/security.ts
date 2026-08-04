/**
 * Devices, sessions, profile and KYC handlers.
 */

import { ErrorCode, KycStatus, routes } from '@reliance/contracts';

import { makeDocument } from '../factories/identity.js';
import { mockId, opaqueId } from '../faker.js';

import {
  acknowledged,
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

const UPLOAD_SIGNATURE_MINUTES = 15;
const EXPORT_DAYS = 7;
const MAX_UPLOAD_BYTES = 10_485_760;
const LETTER_DAYS = 30;

/** Devices, sessions and profile. */
export const securityHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.devices.list, ({ db, query }) => paginate(db.devices, query)),

  route(MockMethod.GET, routes.devices.byId(':id'), ({ db, params }) => {
    const device = db.devices.find((candidate) => candidate.id === params.id);
    return device ? resourceOk(device) : notFound('That device');
  }),

  route(MockMethod.PATCH, routes.devices.byId(':id'), ({ body, db, params }) => {
    const index = db.devices.findIndex((candidate) => candidate.id === params.id);
    const existing = db.devices[index];
    if (index === -1 || !existing) return notFound('That device');
    const updated = { ...existing, ...(body as Record<string, unknown>) };
    db.devices[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.DELETE, routes.devices.byId(':id'), ({ db, params }) => {
    const index = db.devices.findIndex((candidate) => candidate.id === params.id);
    if (index === -1) return notFound('That device');
    db.devices.splice(index, 1);
    return acknowledged();
  }),

  route(MockMethod.GET, routes.devices.sessions, ({ db, query }) => paginate(db.sessions, query)),

  route(MockMethod.POST, routes.devices.revokeAllSessions, ({ db }) => {
    // The current session survives, exactly as the real endpoint behaves: signing the
    // user out of the device they are asking from would make the button unusable.
    db.sessions = db.sessions.filter((session) => session.current);
    return acknowledged();
  }),

  route(MockMethod.DELETE, routes.devices.session(':id'), ({ db, params }) => {
    const session = db.sessions.find((candidate) => candidate.id === params.id);
    if (!session) return notFound('That session');
    if (session.current) {
      return failure(
        ErrorCode.PRECONDITION_FAILED,
        'You cannot revoke the session you are using. Sign out instead.',
      );
    }
    db.sessions = db.sessions.filter((candidate) => candidate.id !== params.id);
    return acknowledged();
  }),

  route(MockMethod.GET, routes.profile.get, ({ db }) => resourceOk(db.profile)),

  route(MockMethod.PATCH, routes.profile.update, ({ body, db }) => {
    db.profile = {
      ...db.profile,
      ...(body as Record<string, unknown>),
      updatedAt: db.clock.nowIso(),
    };
    return resourceOk(db.profile);
  }),

  route(MockMethod.POST, routes.profile.exportData, ({ db }) => {
    const dataExport = {
      id: opaqueId(),
      status: 'QUEUED' as const,
      downloadUrl: null,
      includes: ['profile', 'accounts', 'transactions', 'documents'],
      note: null,
      requestedAt: db.clock.nowIso(),
      readyAt: null,
      expiresAt: db.clock.daysAhead(EXPORT_DAYS),
    };
    db.dataExports.unshift(dataExport);
    return resourceCreated(dataExport);
  }),

  route(MockMethod.POST, routes.profile.closeAccount, ({ db }) => {
    const funded = db.accounts.find((account) => BigInt(account.balance.ledger.amount) !== 0n);
    if (funded) {
      return failure(
        ErrorCode.ACCOUNT_NOT_EMPTY,
        'Empty every account before closing your relationship with us.',
      );
    }
    return acknowledged();
  }),
];

/** KYC. */
export const kycHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.kyc.start, ({ body, db }) => {
    const requestedTier =
      typeof body === 'object' && body !== null
        ? Number((body as { requestedTier?: unknown }).requestedTier ?? 2)
        : 2;
    db.kycCase = {
      ...db.kycCase,
      status: KycStatus.IN_PROGRESS,
      requestedTier,
      completedSteps: [],
      nextStep: 'IDENTITY',
      submittedAt: null,
      decidedAt: null,
      updatedAt: db.clock.nowIso(),
    };
    return resourceCreated(db.kycCase);
  }),

  route(MockMethod.GET, routes.kyc.status, ({ db }) => resourceOk(db.kycCase)),

  route(MockMethod.PUT, routes.kyc.step(':step'), ({ db, params }) => {
    const step = params.step?.toUpperCase();
    const ORDER = ['IDENTITY', 'ADDRESS', 'EMPLOYMENT', 'SOURCE_OF_FUNDS', 'DOCUMENTS', 'LIVENESS'];
    if (!step || !ORDER.includes(step)) {
      return failure(ErrorCode.VALIDATION_FAILED, `"${params.step}" is not a KYC step.`, {
        details: [{ path: 'step', message: `must be one of ${ORDER.join(', ')}` }],
      });
    }

    const completed = [...new Set([...db.kycCase.completedSteps, step])] as typeof ORDER;
    const nextStep = ORDER.find((candidate) => !completed.includes(candidate)) ?? null;

    db.kycCase = {
      ...db.kycCase,
      completedSteps: completed as typeof db.kycCase.completedSteps,
      nextStep: nextStep as typeof db.kycCase.nextStep,
      status: KycStatus.IN_PROGRESS,
      updatedAt: db.clock.nowIso(),
    };
    return resourceOk(db.kycCase);
  }),

  route(MockMethod.GET, routes.kyc.documents, ({ db, query }) =>
    paginate(db.kycCase.documents, query),
  ),

  route(MockMethod.POST, routes.kyc.documents, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const document = makeDocument({
      clock: db.clock,
      overrides: {
        id: mockId('doc'),
        kind: (input.kind as (typeof db.kycCase.documents)[number]['kind']) ?? 'OTHER',
        fileName: typeof input.fileName === 'string' ? input.fileName : 'document.pdf',
        mimeType: typeof input.mimeType === 'string' ? input.mimeType : 'application/pdf',
        uploadedAt: db.clock.nowIso(),
        verified: false,
      },
    });
    db.kycCase = { ...db.kycCase, documents: [...db.kycCase.documents, document] };
    return resourceCreated(document);
  }),

  route(MockMethod.GET, routes.kyc.document(':id'), ({ db, params }) => {
    const document = db.kycCase.documents.find((candidate) => candidate.id === params.id);
    return document ? resourceOk(document) : notFound('That document');
  }),

  route(MockMethod.DELETE, routes.kyc.document(':id'), ({ db, params }) => {
    const remaining = db.kycCase.documents.filter((candidate) => candidate.id !== params.id);
    if (remaining.length === db.kycCase.documents.length) return notFound('That document');
    db.kycCase = { ...db.kycCase, documents: remaining };
    return acknowledged();
  }),

  route(MockMethod.POST, routes.kyc.submit, ({ db }) => {
    if (db.kycCase.documents.length === 0) {
      return failure(
        ErrorCode.KYC_DOCUMENT_INVALID,
        'Upload at least one identity document before submitting.',
      );
    }
    db.kycCase = {
      ...db.kycCase,
      status: KycStatus.UNDER_REVIEW,
      nextStep: 'REVIEW',
      submittedAt: db.clock.nowIso(),
      updatedAt: db.clock.nowIso(),
    };
    return resourceOk(db.kycCase);
  }),

  route(MockMethod.POST, routes.kyc.uploadSignature, ({ db }) => resourceOk(uploadSignature(db))),
];

/** Files. */
export const fileHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.files.uploadSignature, ({ db }) => resourceOk(uploadSignature(db))),

  route(MockMethod.GET, routes.files.byId(':id'), ({ db, params }) => {
    const file = db.files.find((candidate) => candidate.id === params.id);
    if (file) return resourceOk(file);

    // Unknown ids resolve rather than 404: uploads happen straight to the asset host, so
    // the mock legitimately has not seen the id before the client asks about it.
    const created = {
      id: params.id ?? mockId('doc'),
      fileName: 'document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128_000,
      downloadUrl: `https://assets.reliance.test/files/${params.id ?? opaqueId()}`,
      expiresAt: db.clock.daysAhead(1),
      uploadedAt: db.clock.nowIso(),
    };
    db.files.push(created);
    return resourceOk(created);
  }),

  route(MockMethod.DELETE, routes.files.byId(':id'), ({ db, params }) => {
    const index = db.files.findIndex((candidate) => candidate.id === params.id);
    if (index === -1) return notFound('That file');
    const [removed] = db.files.splice(index, 1);
    return resourceOk(removed);
  }),
];

function uploadSignature(db: { clock: { minutesAhead: (m: number) => string } }) {
  return {
    uploadUrl: 'https://uploads.reliance.test/v1/upload',
    signature: opaqueId(),
    timestamp: Math.trunc(Date.parse('2026-08-02T09:00:00.000Z') / 1000),
    apiKey: 'mock-upload-key',
    folder: 'reliance/kyc',
    publicId: opaqueId(),
    expiresAt: db.clock.minutesAhead(UPLOAD_SIGNATURE_MINUTES),
    maxBytes: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  };
}

/** How long a produced letter stays downloadable. */
export const LETTER_VALIDITY_DAYS = LETTER_DAYS;
