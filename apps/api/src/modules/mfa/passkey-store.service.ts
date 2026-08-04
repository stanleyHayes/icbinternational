import { Injectable } from '@nestjs/common';

import { MfaMethod } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { UNKNOWN_ORIGIN } from '../auth/auth.constants.js';
import { UserRepository } from '../auth/users/index.js';
import { toPasskeyView, type PasskeyView } from '../devices/device.mapper.js';
import { DeviceRepository } from '../devices/device.repository.js';
import { type DeviceDocument, type DevicePasskey } from '../devices/device.schema.js';
import { DeviceService } from '../devices/device.service.js';

/** A stored passkey together with the device it lives on. */
export interface StoredCredential {
  device: DeviceDocument;
  passkey: DevicePasskey;
}

/**
 * Passkey persistence: credentials embedded on device documents, and the `PASSKEY` entry
 * in the user's factor list that must never disagree with them.
 *
 * The methods flag is maintained here rather than by the callers because it is a derived
 * fact — true exactly while at least one credential exists — and derived facts drift the
 * moment two writers each remember to maintain them.
 */
@Injectable()
export class PasskeyStoreService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly deviceService: DeviceService,
    private readonly users: UserRepository,
  ) {}

  /** Every credential the customer holds, flattened across their devices. */
  async listCredentials(userId: string): Promise<StoredCredential[]> {
    const devices = await this.devices.findWithPasskeys(userId);
    return devices.flatMap((device) => device.passkeys.map((passkey) => ({ device, passkey })));
  }

  /** One credential by id, or null — the authentication ceremony's lookup. */
  async findCredential(userId: string, credentialId: string): Promise<StoredCredential | null> {
    const device = await this.devices.findByPasskeyCredential(userId, credentialId);
    const passkey = device?.passkeys.find((entry) => entry.credentialId === credentialId);
    return device && passkey ? { device, passkey } : null;
  }

  /**
   * Stores a verified credential and marks the customer passkey-capable in the same flow.
   *
   * When the session has no recognised device, the authenticator becomes its own device
   * row keyed by a synthetic fingerprint: a hardware key *is* a machine the customer signs
   * in from, and it belongs on the security screen like any other.
   */
  async storePasskey(
    userId: string,
    deviceId: string | null,
    passkey: DevicePasskey,
  ): Promise<PasskeyView> {
    const device = await this.resolveDevice(userId, deviceId, passkey.credentialId);

    const updated = await this.devices.addPasskey(device.id, passkey);
    if (!updated) throw AppError.notFound('Device', device.id);

    await this.users.patch(userId, { $addToSet: { 'mfa.methods': MfaMethod.PASSKEY } });
    return toPasskeyView(passkey, device.label);
  }

  /** Advances a credential's sign counter and usage stamp after a verified assertion. */
  async recordUse(
    deviceId: string,
    credentialId: string,
    counter: number,
    at: Date,
  ): Promise<void> {
    await this.devices.recordPasskeyUse({ deviceId, credentialId, counter, at });
  }

  /**
   * Removes one credential, and the `PASSKEY` factor with it when the last one goes.
   *
   * @throws {AppError} `NOT_FOUND` for an unknown or foreign credential id — one answer
   *   for both, so probing cannot map another customer's passkeys.
   */
  async removePasskey(userId: string, credentialId: string): Promise<void> {
    const stored = await this.findCredential(userId, credentialId);
    if (!stored) throw AppError.notFound('Passkey', credentialId);

    await this.devices.removePasskey(stored.device.id, credentialId);

    const remaining = await this.devices.findWithPasskeys(userId);
    if (remaining.length === 0) {
      await this.users.patch(userId, { $pull: { 'mfa.methods': MfaMethod.PASSKEY } });
    }
  }

  private async resolveDevice(
    userId: string,
    deviceId: string | null,
    credentialId: string,
  ): Promise<DeviceDocument> {
    if (!deviceId) {
      const sighting = await this.deviceService.recognise({
        userId,
        fingerprint: `passkey:${credentialId}`,
        origin: { ip: UNKNOWN_ORIGIN, userAgent: UNKNOWN_ORIGIN },
      });
      return sighting.device;
    }

    const device = await this.devices.findById(deviceId);
    if (!device || device.userId !== userId) throw AppError.notFound('Device', deviceId);
    return device;
  }
}
