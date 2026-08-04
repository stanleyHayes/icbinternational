import { type Device as DeviceView } from '@reliance/contracts';

import { type DeviceDocument, type DevicePasskey } from './device.schema.js';

/**
 * A registered passkey as the security screen lists it.
 *
 * Mirrors the provisional `Passkey` shape the client dashboard already consumes
 * (`packages/api-client/src/provisional/documents.ts`); promoting that schema into the
 * frozen contract is proposed in this task's handoff notes.
 */
export interface PasskeyView {
  /** The credential id — already unique and opaque, so it serves as the public id. */
  id: string;
  label: string;
  deviceLabel: string | null;
  aaguid: string | null;
  backedUp: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * Projects a stored device onto the contract view.
 *
 * Field by field rather than spread: the document carries the fingerprint and the passkey
 * public keys, and neither may ever appear in a response.
 */
export function toDeviceView(device: DeviceDocument): DeviceView {
  return {
    id: device.id,
    label: device.label,
    platform: device.platform,
    trust: device.trust,
    hasPasskey: device.hasPasskey,
    firstSeenAt: device.firstSeenAt.toISOString(),
    lastSeenAt: device.lastSeenAt.toISOString(),
  };
}

/** Projects an embedded passkey onto its view, naming the device it lives on. */
export function toPasskeyView(passkey: DevicePasskey, deviceLabel: string | null): PasskeyView {
  return {
    id: passkey.credentialId,
    label: passkey.label,
    deviceLabel,
    aaguid: passkey.aaguid,
    backedUp: passkey.backedUp,
    lastUsedAt: passkey.lastUsedAt ? passkey.lastUsedAt.toISOString() : null,
    createdAt: passkey.createdAt.toISOString(),
  };
}
