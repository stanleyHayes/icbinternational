/**
 * The channel a movement arrives through.
 *
 * Channels are the second axis of a cap after the scope: the same `cardSpend` allowance
 * is capped harder online than at a chip terminal, because card-not-present fraud is
 * where the losses are. The card values deliberately mirror the contract's card-channel
 * enum so a card authorisation can pass its own channel straight through.
 *
 * `DEFAULT` is what a caller passes when the movement has no meaningful channel — an
 * internal transfer is not "online" in the fraud sense. It always resolves to the
 * scope-level cap row.
 */
export const LimitChannel = {
  DEFAULT: 'DEFAULT',
  ONLINE: 'ONLINE',
  CONTACTLESS: 'CONTACTLESS',
  CHIP: 'CHIP',
  MAGSTRIPE: 'MAGSTRIPE',
  ATM: 'ATM',
  RECURRING: 'RECURRING',
} as const;
export type LimitChannel = (typeof LimitChannel)[keyof typeof LimitChannel];

/**
 * Narrows an arbitrary string to a channel, defaulting unknown values to `DEFAULT`.
 *
 * Callers at the edge (controllers, card auth) pass strings off the wire; the engine
 * treats anything it does not recognise as channel-less rather than refusing a payment
 * over a vocabulary mismatch.
 */
export function toLimitChannel(value: string | undefined): LimitChannel {
  const channels: readonly string[] = Object.values(LimitChannel);
  return value && channels.includes(value) ? (value as LimitChannel) : LimitChannel.DEFAULT;
}
