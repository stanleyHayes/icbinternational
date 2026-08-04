/**
 * Removing an object the bank has decided not to keep.
 *
 * Best-effort on purpose. The decision that matters — the asset is not in the register, so
 * nothing will ever serve it — has already been made by the time this runs, and a provider
 * outage must not turn a correctly refused upload into a failed request the customer reads
 * as "try again". The orphan is logged and swept later.
 */

import { type Logger } from '@nestjs/common';

import { type MediaStoragePort } from './ports/media-storage.port.js';

export async function discardQuietly(
  storage: MediaStoragePort,
  storageKey: string,
  logger: Logger,
): Promise<void> {
  try {
    await storage.remove(storageKey);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not remove rejected object ${storageKey}: ${detail}`);
  }
}
