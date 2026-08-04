'use client';

/**
 * Carrying a second-factor challenge from the sign-in screen to the challenge screen.
 *
 * The challenge id is not a credential — on its own it authorises nothing, and the API expires it
 * within minutes — but it is single-use state that must survive a full navigation and a refresh.
 * `sessionStorage` is the right scope: it dies with the tab, so an abandoned challenge cannot be
 * picked up by whoever uses the machine next.
 *
 * Exposed as a subscribable store rather than a plain read, so the challenge screen can take it
 * through `useSyncExternalStore`: the server render sees nothing (correctly — it has no tab
 * storage), the browser sees the challenge, and neither needs an effect to copy it into state.
 */

import { z } from 'zod';

import { MfaMethod } from '@reliance/contracts';

import { nowMs } from './clock';
import { persistentValue } from './persistent-value';

const STORAGE_KEY = 'rb.challenge';

const storedChallengeSchema = z.object({
  challengeId: z.string().min(1),
  methods: z.array(z.enum(MfaMethod)).min(1),
  expiresAt: z.iso.datetime(),
  /** Carried through so the challenge screen can name the account being signed in to. */
  email: z.email(),
  /** Whether the customer asked us to remember this device, chosen before the challenge. */
  rememberDevice: z.boolean(),
  /**
   * When this browser received the challenge, by its own clock.
   *
   * Stored so the countdown can be measured against the device's own passage of time rather than
   * against the difference between two clocks. See `use-challenge-countdown.ts`.
   */
  receivedAtMs: z.number().int().positive(),
});

/** A challenge waiting to be answered. */
export type StoredChallenge = z.infer<typeof storedChallengeSchema>;

/**
 * A challenge as the sign-in screen has it.
 *
 * `methods` is read-only there because it came out of a parsed API response; the stored shape is
 * the same data, so the write side accepts either rather than forcing a defensive copy.
 * `receivedAtMs` is stamped on by {@link rememberChallenge}, not supplied by the caller.
 */
export type ChallengeToStore = Omit<StoredChallenge, 'methods' | 'receivedAtMs'> & {
  readonly methods: readonly StoredChallenge['methods'][number][];
};

function parse(raw: string): StoredChallenge | null {
  try {
    const parsed = storedChallengeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The pending challenge, as a store the challenge screen subscribes to. */
export const challengeStore = persistentValue<StoredChallenge | null>({
  key: STORAGE_KEY,
  area: 'session',
  fallback: null,
  parse,
  serialise: (value) => (value ? JSON.stringify(value) : null),
});

/** Saves the challenge for the screen that will answer it. */
export function rememberChallenge(challenge: ChallengeToStore): void {
  challengeStore.write({ ...challenge, receivedAtMs: nowMs() } as StoredChallenge);
}

/** Discards the challenge. Called once it is answered, abandoned or expired. */
export function forgetChallenge(): void {
  challengeStore.write(null);
}
