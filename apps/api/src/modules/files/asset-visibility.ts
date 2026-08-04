/**
 * Who may read an asset, decided from what it is for.
 *
 * Deliberately not in any storage adapter. Whether a passport scan is publicly addressable
 * is a decision about the bank's obligations, not about Cloudinary's delivery types, and an
 * adapter that could make it differently from the next adapter is one deployment away from
 * making it wrong.
 */

import { AssetVisibility, RESTRICTED_PURPOSES, type AssetPurpose } from './files.constants.js';

/** Restricted purposes are decided once, here, and nowhere else. */
export function visibilityFor(purpose: AssetPurpose): AssetVisibility {
  return RESTRICTED_PURPOSES.includes(purpose)
    ? AssetVisibility.RESTRICTED
    : AssetVisibility.PUBLIC;
}
