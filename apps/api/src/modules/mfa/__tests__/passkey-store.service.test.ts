import { MfaMethod } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { type UserRepository } from '../../auth/users/index.js';
import { type DeviceRepository } from '../../devices/device.repository.js';
import { type DeviceDocument, type DevicePasskey } from '../../devices/device.schema.js';
import { type DeviceService } from '../../devices/device.service.js';
import { PasskeyStoreService } from '../passkey-store.service.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const DEVICE_ID = 'dev_01HZY5TCA5J7Y5KM5MT8P6V5FF';
const CREDENTIAL_ID = 'Y3JlZGVudGlhbC0wMDE';

function passkeyOf(credentialId: string = CREDENTIAL_ID): DevicePasskey {
  return {
    credentialId,
    publicKey: 'cHVibGljLWtleQ',
    counter: 0,
    label: 'YubiKey',
    aaguid: null,
    transports: ['usb'],
    backedUp: false,
    createdAt: new Date('2026-02-01T12:00:00.000Z'),
    lastUsedAt: null,
  };
}

function deviceWith(passkeys: DevicePasskey[]): DeviceDocument {
  return {
    id: DEVICE_ID,
    userId: USER_ID,
    label: 'Chrome on macOS',
    hasPasskey: passkeys.length > 0,
    passkeys,
  } as unknown as DeviceDocument;
}

class FakeDeviceRepository {
  device: DeviceDocument | null = deviceWith([]);

  async findById(): Promise<DeviceDocument | null> {
    return this.device;
  }

  async addPasskey(): Promise<DeviceDocument | null> {
    if (!this.device) return null;
    this.device.passkeys.push(passkeyOf());
    this.device.hasPasskey = true;
    return this.device;
  }

  async findByPasskeyCredential(
    userId: string,
    credentialId: string,
  ): Promise<DeviceDocument | null> {
    if (!this.device || this.device.userId !== userId) return null;
    return this.device.passkeys.some((entry) => entry.credentialId === credentialId)
      ? this.device
      : null;
  }

  async findWithPasskeys(): Promise<DeviceDocument[]> {
    return this.device?.hasPasskey ? [this.device] : [];
  }

  async removePasskey(): Promise<DeviceDocument | null> {
    if (!this.device) return null;
    this.device.passkeys = [];
    this.device.hasPasskey = false;
    return this.device;
  }

  async recordPasskeyUse(): Promise<void> {}
}

class FakeUserRepository {
  readonly patches: Record<string, unknown>[] = [];

  async patch(_id: string, update: Record<string, unknown>): Promise<null> {
    this.patches.push(update);
    return null;
  }
}

function build(options: { withSessionDevice: boolean }): {
  store: PasskeyStoreService;
  repo: FakeDeviceRepository;
  users: FakeUserRepository;
} {
  const repo = new FakeDeviceRepository();
  const users = new FakeUserRepository();
  const synthetic = deviceWith([]);
  const deviceService = {
    recognise: () => Promise.resolve({ device: synthetic, isFirstSighting: true }),
  } as unknown as DeviceService;

  if (!options.withSessionDevice) repo.device = null;

  const store = new PasskeyStoreService(
    repo as unknown as DeviceRepository,
    deviceService,
    users as unknown as UserRepository,
  );
  return { store, repo, users };
}

describe('PasskeyStoreService.storePasskey', () => {
  it('attaches the credential to the session device and marks the factor', async () => {
    const { store, users } = build({ withSessionDevice: true });

    const view = await store.storePasskey(USER_ID, DEVICE_ID, passkeyOf());

    expect(view.id).toBe(CREDENTIAL_ID);
    expect(view.deviceLabel).toBe('Chrome on macOS');
    expect(users.patches).toEqual([{ $addToSet: { 'mfa.methods': MfaMethod.PASSKEY } }]);
  });

  it('gives the authenticator its own device row when the session has none', async () => {
    const { store, repo } = build({ withSessionDevice: false });

    const failure = await store
      .storePasskey(USER_ID, 'dev_01HZY6UDB6K8Z6LN6NU9Q7W6GG', passkeyOf())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(repo.device).toBeNull();
  });
});

describe('PasskeyStoreService.removePasskey', () => {
  it('removes the credential and the factor when the last one goes', async () => {
    const { store, repo, users } = build({ withSessionDevice: true });
    await store.storePasskey(USER_ID, DEVICE_ID, passkeyOf());

    await store.removePasskey(USER_ID, CREDENTIAL_ID);

    expect(repo.device?.hasPasskey).toBe(false);
    expect(users.patches.at(-1)).toEqual({ $pull: { 'mfa.methods': MfaMethod.PASSKEY } });
  });

  it('answers an unknown credential with not-found', async () => {
    const { store } = build({ withSessionDevice: true });

    const failure = await store
      .removePasskey(USER_ID, 'aW52ZW50ZWQtY3JlZGVudGlhbA')
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe('NOT_FOUND');
  });
});
