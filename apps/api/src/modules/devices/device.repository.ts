import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { type DeviceTrust } from '@reliance/contracts';

import { BaseRepository } from '../../database/base.repository.js';

import { Device, type DeviceDocument, type DevicePasskey } from './device.schema.js';

/** Everything known about a device the first time it is seen. */
export interface NewDeviceRecord {
  id: string;
  userId: string;
  fingerprint: string;
  label: string;
  platform: string;
  trust: DeviceTrust;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** Persistence for the `devices` collection. */
@Injectable()
export class DeviceRepository extends BaseRepository<Device> {
  constructor(@InjectModel(Device.name) model: Model<Device>) {
    super(model);
  }

  async findByFingerprint(userId: string, fingerprint: string): Promise<DeviceDocument | null> {
    return this.findOne({ userId, fingerprint } as QueryFilter<Device>);
  }

  /** The customer's devices, most recently used first — the order the UI wants them in. */
  async findForUser(userId: string): Promise<DeviceDocument[]> {
    return this.find({ userId } as QueryFilter<Device>, { sort: { lastSeenAt: -1 } }) as Promise<
      DeviceDocument[]
    >;
  }

  /**
   * Records a device on first sight, or returns the existing row.
   *
   * `upsert` with `$setOnInsert` rather than a find-then-insert, because two tabs
   * completing a login at once would both find nothing and then collide on the unique
   * `userId + fingerprint` index.
   */
  async upsert(record: NewDeviceRecord): Promise<DeviceDocument> {
    // `lastSeenAt` is the one field that must move on every sight, so it belongs to `$set`
    // alone. Naming it in both operators makes MongoDB reject the update as a conflict.
    const { lastSeenAt, ...onInsert } = record;

    const upserted = await this.collection
      .findOneAndUpdate(
        { userId: record.userId, fingerprint: record.fingerprint } as QueryFilter<Device>,
        { $setOnInsert: onInsert, $set: { lastSeenAt } },
        { new: true, upsert: true },
      )
      .exec();

    return upserted as DeviceDocument;
  }

  async setTrust(id: string, trust: DeviceTrust): Promise<DeviceDocument | null> {
    return this.updateById(id, { $set: { trust } }) as Promise<DeviceDocument | null>;
  }

  /** Attaches a freshly verified passkey and flips the cheap `hasPasskey` flag with it. */
  async addPasskey(deviceId: string, passkey: DevicePasskey): Promise<DeviceDocument | null> {
    return this.updateById(deviceId, {
      $push: { passkeys: passkey },
      $set: { hasPasskey: true },
    }) as Promise<DeviceDocument | null>;
  }

  /**
   * Removes one passkey, clearing `hasPasskey` when the last one goes.
   *
   * The flag update is a second conditional write rather than a read-modify-write, so two
   * concurrent removals cannot leave the flag set over an empty list.
   */
  async removePasskey(deviceId: string, credentialId: string): Promise<DeviceDocument | null> {
    const updated = await this.updateOne({ id: deviceId } as QueryFilter<Device>, {
      $pull: { passkeys: { credentialId } },
    });
    if (!updated) return null;

    return this.updateOne({ id: deviceId, passkeys: { $size: 0 } } as QueryFilter<Device>, {
      $set: { hasPasskey: false },
    }) as Promise<DeviceDocument | null>;
  }

  /** Finds the device holding a passkey, for the authentication ceremony. */
  async findByPasskeyCredential(
    userId: string,
    credentialId: string,
  ): Promise<DeviceDocument | null> {
    return this.findOne({ userId, 'passkeys.credentialId': credentialId } as QueryFilter<Device>);
  }

  /** Every device of the customer's that holds at least one passkey. */
  async findWithPasskeys(userId: string): Promise<DeviceDocument[]> {
    return this.find({ userId, hasPasskey: true } as QueryFilter<Device>) as Promise<
      DeviceDocument[]
    >;
  }

  /**
   * Advances a passkey's sign counter and usage stamp after a verified assertion.
   *
   * Storing the counter is what lets the next verification refuse a cloned authenticator:
   * a real one counts monotonically, so a value at or below the stored one is a forgery.
   */
  async recordPasskeyUse(input: {
    deviceId: string;
    credentialId: string;
    counter: number;
    at: Date;
  }): Promise<void> {
    await this.updateOne(
      { id: input.deviceId, 'passkeys.credentialId': input.credentialId } as QueryFilter<Device>,
      {
        $set: {
          'passkeys.$.counter': input.counter,
          'passkeys.$.lastUsedAt': input.at,
        },
      },
    );
  }
}
