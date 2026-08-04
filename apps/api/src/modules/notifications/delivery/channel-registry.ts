import { Inject, Injectable } from '@nestjs/common';

import { type NotificationChannel } from '@reliance/contracts';

import { NotificationChannelAdapter } from '../channels/channel.port.js';

/**
 * Channel lookup by name.
 *
 * Nest injects every registered {@link NotificationChannelAdapter}; this indexes them, so
 * the delivery service never imports a concrete channel. Adding a channel is a provider
 * registration and nothing else — no `switch`, and no file that has to be remembered.
 */
@Injectable()
export class ChannelRegistry {
  private readonly byChannel: ReadonlyMap<NotificationChannel, NotificationChannelAdapter>;

  /**
   * The token is named explicitly because the emitted design-time metadata for an array
   * parameter is `Array`, which Nest cannot resolve to a provider.
   */
  constructor(@Inject(NotificationChannelAdapter) adapters: NotificationChannelAdapter[]) {
    this.byChannel = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  get(channel: NotificationChannel): NotificationChannelAdapter | null {
    return this.byChannel.get(channel) ?? null;
  }

  get available(): readonly NotificationChannel[] {
    return [...this.byChannel.keys()];
  }
}
