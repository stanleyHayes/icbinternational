import { Injectable } from '@nestjs/common';

import { DeviceTrust, type CursorQuery, type Device as DeviceView } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { type RequestOrigin } from '../auth/auth.types.js';

import { toDeviceView } from './device.mapper.js';
import { DeviceRepository } from './device.repository.js';
import { type DeviceDocument } from './device.schema.js';
import { describeUserAgent } from './user-agent.js';

/** What a login knows about the machine it arrived from. */
export interface DeviceSighting {
  userId: string;
  fingerprint: string;
  origin: RequestOrigin;
}

/** The result of recognising a device, including whether it is new to this customer. */
export interface RecognisedDevice {
  device: DeviceDocument;
  /** True the first time this customer signs in from this fingerprint. */
  isFirstSighting: boolean;
}

/**
 * Device recognition and trust.
 *
 * Trust here only ever *removes* friction — it can let a returning browser skip a
 * second-factor prompt, and it can never stand in for one. The fingerprint is computed by
 * the client, so anything it asserts an attacker can assert too; treating it as an
 * identity would hand out sessions to whoever copies a string.
 *
 * `BLOCKED` is the exception, and it runs the other way: a customer who marks a device
 * blocked is making a negative claim, and honouring a negative claim from an untrusted
 * source is safe.
 */
@Injectable()
export class DeviceService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Records a sighting, creating the device on first contact.
   *
   * A device seen before is promoted from `UNKNOWN` to `RECOGNISED` — that is the
   * distinction between "we have never seen this" and "this has signed in successfully
   * before", and it is what the risk decision at login actually consults.
   */
  async recognise(sighting: DeviceSighting): Promise<RecognisedDevice> {
    const now = this.clock.now();
    const existing = await this.devices.findByFingerprint(sighting.userId, sighting.fingerprint);
    const description = describeUserAgent(sighting.origin.userAgent);

    const device = await this.devices.upsert({
      id: existing?.id ?? this.ids.generate('device'),
      userId: sighting.userId,
      fingerprint: sighting.fingerprint,
      label: description.label,
      platform: description.platform,
      trust: DeviceTrust.UNKNOWN,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    });

    if (existing && existing.trust === DeviceTrust.UNKNOWN) {
      await this.devices.setTrust(device.id, DeviceTrust.RECOGNISED);
    }

    return { device, isFirstSighting: existing === null };
  }

  /**
   * Refuses a device the customer has blocked.
   *
   * Checked before the password, unlike every other status: a blocked device is a standing
   * instruction from the account owner, and honouring it early means a stolen password
   * cannot even be tested from that machine.
   */
  assertNotBlocked(device: DeviceDocument): void {
    if (device.trust !== DeviceTrust.BLOCKED) return;

    throw AppError.forbidden('This device has been blocked from accessing the account.');
  }

  /** True when the customer has explicitly trusted this device. */
  isTrusted(device: DeviceDocument): boolean {
    return device.trust === DeviceTrust.TRUSTED;
  }

  /** Marks a device trusted so it stops being challenged for a second factor. */
  async trust(userId: string, deviceId: string): Promise<DeviceView> {
    return toDeviceView(await this.setTrust(userId, deviceId, DeviceTrust.TRUSTED));
  }

  /** Blocks a device. Any live session on it is left to the session service to revoke. */
  async block(userId: string, deviceId: string): Promise<DeviceView> {
    return toDeviceView(await this.setTrust(userId, deviceId, DeviceTrust.BLOCKED));
  }

  /**
   * The customer's devices as a cursor page, most recently used first.
   *
   * A customer owns so few devices that the page is sliced in memory from one small read;
   * the cursor is still a real one, so a client built against it works unchanged against
   * the larger lists elsewhere in the API.
   */
  async list(userId: string, page: CursorQuery): Promise<PageResult<DeviceView>> {
    const devices = await this.devices.findForUser(userId);
    const after = page.cursor ? decodeCursor(page.cursor) : null;
    const visible = after ? devices.slice(indexAfter(devices, after.id)) : devices;

    return buildPage({
      records: visible.map(toDeviceView),
      limit: page.limit,
      toCursor: (device) => ({ sortValue: device.lastSeenAt, id: device.id }),
      total: devices.length,
    });
  }

  private async setTrust(
    userId: string,
    deviceId: string,
    trust: DeviceTrust,
  ): Promise<DeviceDocument> {
    const device = await this.devices.findById(deviceId);

    // Ownership is checked with the same "not found" answer as a missing id, so that
    // probing ids cannot tell a stranger which ones exist on someone else's account.
    if (!device || device.userId !== userId) throw AppError.notFound('Device', deviceId);

    const updated = await this.devices.setTrust(deviceId, trust);
    if (!updated) throw AppError.notFound('Device', deviceId);
    return updated;
  }
}

/** Position just past the record the cursor names, or the start when it is stale. */
function indexAfter(devices: readonly DeviceDocument[], id: string): number {
  const index = devices.findIndex((device) => device.id === id);
  return index === -1 ? 0 : index + 1;
}
