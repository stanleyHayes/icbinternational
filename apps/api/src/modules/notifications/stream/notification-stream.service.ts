/**
 * The live in-app stream.
 *
 * One RxJS subject per connected customer, multicast to their open tabs. Server-sent
 * events rather than a WebSocket: the traffic is one-directional, it survives a proxy that
 * does not understand upgrade requests, and the browser reconnects on its own — three
 * properties a notification feed wants and a chat protocol does not need.
 *
 * A heartbeat goes down every idle connection, because an intermediary that sees no bytes
 * for a minute will close it and the customer will silently stop receiving anything.
 *
 * This is in-process state. With more than one API instance a customer connected to
 * instance A will not see an event published on instance B, so a Redis fan-out belongs
 * behind this same interface before the API is scaled horizontally — noted in
 * `docs/HANDOFFS.md` rather than pretended away.
 */

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, filter, finalize, map, merge, interval } from 'rxjs';

import { type Notification, type NotificationStreamEvent } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import {
  MAX_STREAM_SUBSCRIBERS_PER_USER,
  STREAM_HEARTBEAT_MS,
} from '../notifications.constants.js';

interface AddressedEvent {
  readonly userId: string;
  readonly event: NotificationStreamEvent;
}

@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly events = new Subject<AddressedEvent>();
  private readonly connectionCounts = new Map<string, number>();

  constructor(private readonly clock: ClockService) {}

  /** Pushes a notification to whichever of the customer's tabs are open. */
  publishNotification(userId: string, notification: Notification): void {
    this.events.next({ userId, event: { event: 'notification', data: notification } });
  }

  /** Tells the client a balance moved, so it can refetch rather than be told the figure. */
  publishBalanceChange(userId: string, accountId: string): void {
    this.events.next({ userId, event: { event: 'balance', data: { accountId } } });
  }

  /** True when the customer already has as many connections as they are allowed. */
  isAtConnectionLimit(userId: string): boolean {
    return (this.connectionCounts.get(userId) ?? 0) >= MAX_STREAM_SUBSCRIBERS_PER_USER;
  }

  /**
   * The stream for one customer.
   *
   * Filtered by user id at the source, so an event for one customer is never evaluated
   * against another's subscription. `finalize` decrements the connection count however the
   * subscription ends — a closed tab, a dropped connection, a shutdown — which is what
   * keeps the limit from leaking on an abrupt disconnect.
   */
  streamFor(userId: string): Observable<NotificationStreamEvent> {
    this.connectionCounts.set(userId, (this.connectionCounts.get(userId) ?? 0) + 1);

    const notifications = this.events.pipe(
      filter((addressed) => addressed.userId === userId),
      map((addressed) => addressed.event),
    );

    return merge(notifications, this.heartbeats()).pipe(
      finalize(() => this.releaseConnection(userId)),
    );
  }

  onModuleDestroy(): void {
    this.events.complete();
    this.connectionCounts.clear();
  }

  private heartbeats(): Observable<NotificationStreamEvent> {
    return interval(STREAM_HEARTBEAT_MS).pipe(
      map(() => ({ event: 'heartbeat' as const, data: { at: this.clock.now().toISOString() } })),
    );
  }

  private releaseConnection(userId: string): void {
    const remaining = (this.connectionCounts.get(userId) ?? 1) - 1;
    if (remaining <= 0) {
      this.connectionCounts.delete(userId);
      return;
    }
    this.connectionCounts.set(userId, remaining);
    this.logger.debug(`${remaining} live connection(s) remain for this customer`);
  }
}
