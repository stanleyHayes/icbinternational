import { ErrorCode } from '@reliance/contracts';

import { type AppError } from '../../../common/errors/app-error.js';
import { SessionRevocation } from '../../auth/auth.constants.js';
import { type SessionDocument } from '../../auth/schemas/session.schema.js';
import { type SessionService } from '../../auth/session.service.js';
import { type SessionViewRepository } from '../session-view.repository.js';
import { SessionsService } from '../sessions.service.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const OTHER_USER_ID = 'usr_01HZY1N8W1E3U1GI1HP4K2R1BB';
const CURRENT_SESSION = 'ses_01HZY2P9X2F4V2HJ2JQ5L3S2CC';
const OTHER_SESSION = 'ses_01HZY3QAY3G5W3IK3KR6M4T3DD';

function row(id: string, userId: string): SessionDocument {
  return {
    id,
    userId,
    ip: '198.51.100.7',
    userAgent: 'Mozilla/5.0 Chrome/126.0.0.0',
    createdAt: new Date('2026-02-01T12:00:00.000Z'),
    lastSeenAt: new Date('2026-02-01T12:30:00.000Z'),
    expiresAt: new Date('2026-03-01T12:00:00.000Z'),
  } as unknown as SessionDocument;
}

class FakeSessionViews {
  rows: SessionDocument[] = [];

  async findLiveForUser(userId: string): Promise<SessionDocument[]> {
    return this.rows.filter((entry) => entry.userId === userId);
  }

  async findLiveById(id: string): Promise<SessionDocument | null> {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async findLiveForDevice(userId: string, deviceId: string): Promise<SessionDocument[]> {
    return this.rows.filter(
      (entry) =>
        entry.userId === userId && (entry as unknown as { deviceId: string }).deviceId === deviceId,
    );
  }
}

class FakeSessionService {
  readonly revoked: { id: string; reason: SessionRevocation }[] = [];
  readonly revokedAll: { userId: string; except?: string }[] = [];

  async revoke(id: string, reason: SessionRevocation): Promise<void> {
    this.revoked.push({ id, reason });
  }

  async revokeAllForUser(
    userId: string,
    _reason: SessionRevocation,
    except?: string,
  ): Promise<void> {
    this.revokedAll.push({ userId, except });
  }
}

function build(): {
  service: SessionsService;
  views: FakeSessionViews;
  sessions: FakeSessionService;
} {
  const views = new FakeSessionViews();
  const sessions = new FakeSessionService();
  const service = new SessionsService(
    views as unknown as SessionViewRepository,
    sessions as unknown as SessionService,
  );
  return { service, views, sessions };
}

describe('SessionsService.list', () => {
  it('flags the requesting session and hides the token-chain internals', async () => {
    const { service, views } = build();
    views.rows = [row(CURRENT_SESSION, USER_ID), row(OTHER_SESSION, USER_ID)];

    const page = await service.list(USER_ID, CURRENT_SESSION, { limit: 25 });

    expect(page.data).toHaveLength(2);
    const current = page.data.find((entry) => entry.id === CURRENT_SESSION);
    expect(current?.current).toBe(true);
    expect(current?.deviceLabel).toBe('Chrome on Unknown platform');
    expect(current?.location).toBeNull();
    expect(page.data.find((entry) => entry.id === OTHER_SESSION)?.current).toBe(false);
  });
});

describe('SessionsService.revoke', () => {
  it('revokes another of the customer sessions as a remote revoke', async () => {
    const { service, views, sessions } = build();
    views.rows = [row(OTHER_SESSION, USER_ID)];

    await service.revoke(USER_ID, OTHER_SESSION, CURRENT_SESSION);

    expect(sessions.revoked).toEqual([
      { id: OTHER_SESSION, reason: SessionRevocation.REMOTE_REVOKE },
    ]);
  });

  it('refuses to revoke the session making the request', async () => {
    const { service, views } = build();
    views.rows = [row(CURRENT_SESSION, USER_ID)];

    const failure = await service
      .revoke(USER_ID, CURRENT_SESSION, CURRENT_SESSION)
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.PRECONDITION_FAILED);
  });

  it('answers unknown and foreign sessions with the same not-found', async () => {
    const { service, views } = build();
    views.rows = [row(OTHER_SESSION, OTHER_USER_ID)];

    const foreign = await service
      .revoke(USER_ID, OTHER_SESSION, CURRENT_SESSION)
      .catch((error: unknown) => error);
    const unknown = await service
      .revoke(USER_ID, 'ses_01HZY4RBZ4H6X4JL4LS7N5U4EE', CURRENT_SESSION)
      .catch((error: unknown) => error);

    expect((foreign as AppError).code).toBe(ErrorCode.NOT_FOUND);
    expect((unknown as AppError).code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('SessionsService bulk revocation', () => {
  it('revoke-all spares the requesting session', async () => {
    const { service, sessions } = build();

    await service.revokeAllOthers(USER_ID, CURRENT_SESSION);

    expect(sessions.revokedAll).toEqual([{ userId: USER_ID, except: CURRENT_SESSION }]);
  });

  it('revokes every live session bound to a removed device', async () => {
    const { service, views, sessions } = build();
    const onDevice = {
      ...row(OTHER_SESSION, USER_ID),
      deviceId: 'dev_x',
    } as unknown as SessionDocument;
    const elsewhere = {
      ...row(CURRENT_SESSION, USER_ID),
      deviceId: 'dev_y',
    } as unknown as SessionDocument;
    views.rows = [onDevice, elsewhere];

    await service.revokeForDevice(USER_ID, 'dev_x');

    expect(sessions.revoked).toEqual([
      { id: OTHER_SESSION, reason: SessionRevocation.REMOTE_REVOKE },
    ]);
  });
});
