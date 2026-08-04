/**
 * Persistence boundary for a customer's notification preferences.
 *
 * One document per customer. The stored matrix is exactly what they submitted, including
 * a `SECURITY` row switched off if a client managed to send one — the override lives in
 * the resolver, and storing the honest value keeps the two concerns separable.
 */

import { type ChannelPreference } from '@reliance/contracts';

export interface PreferenceRecord {
  readonly userId: string;
  readonly preferences: readonly ChannelPreference[];
  readonly quietHours: { readonly from: string; readonly to: string } | null;
  readonly timezone: string;
  /** Email addresses digest batching should target. Empty means "the account address". */
  readonly digestEnabledCategories: readonly string[];
  readonly updatedAt: Date;
}

export interface SavePreferenceInput {
  readonly userId: string;
  readonly preferences: readonly ChannelPreference[];
  readonly quietHours: { readonly from: string; readonly to: string } | null;
  readonly timezone: string;
  readonly digestEnabledCategories: readonly string[];
}

export abstract class PreferenceStore {
  abstract findFor(userId: string): Promise<PreferenceRecord | null>;

  /** Creates or replaces the customer's matrix. */
  abstract save(input: SavePreferenceInput): Promise<PreferenceRecord>;
}
