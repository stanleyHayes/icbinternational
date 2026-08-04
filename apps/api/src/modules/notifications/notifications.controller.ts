import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import {
  listNotificationsQuerySchema,
  markReadRequestSchema,
  notificationPreferencesSchema,
  pushSubscriptionRequestSchema,
  routes,
  type Notification,
  type NotificationPreferences,
  type Paginated,
  type PushSubscriptionRequest,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { PushSubscriptionStore } from './channels/push/push-subscription.store.js';
import { NotificationCentreService } from './notification-centre.service.js';
import { type PushSubscriptionAccepted, type UnreadCount } from './notifications.dto.js';
import { NotificationPreferencesService } from './preferences/preferences.service.js';
import { NotificationStreamService } from './stream/notification-stream.service.js';

/** An SSE frame as Nest's `@Sse` decorator expects it. */
interface ServerSentEvent {
  readonly type: string;
  readonly data: string;
}

/**
 * The customer's notification surface: the centre, their preferences, and the live stream.
 *
 * Every handler takes the caller from the verified token. There is no route here that
 * accepts a user id, which is what makes another customer's notification centre
 * unreachable rather than merely guarded.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly centre: NotificationCentreService,
    private readonly preferences: NotificationPreferencesService,
    private readonly stream: NotificationStreamService,
    private readonly pushSubscriptions: PushSubscriptionStore,
    private readonly clock: ClockService,
  ) {}

  @Get(routes.notifications.list)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listNotificationsQuerySchema)) query: Record<string, unknown>,
  ): Promise<Paginated<Notification>> {
    const parsed = listNotificationsQuerySchema.parse(query);

    return this.centre.list({
      userId: user.userId,
      limit: parsed.limit,
      unreadOnly: parsed.unreadOnly,
      ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
      ...(parsed.category ? { category: parsed.category } : {}),
    });
  }

  @Get(`${routes.notifications.list}/unread-count`)
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCount> {
    return { unread: await this.centre.unreadCount(user.userId) };
  }

  @Post(routes.notifications.markRead)
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(markReadRequestSchema)) request: { ids: string[] },
  ): Promise<UnreadCount> {
    await this.centre.markRead(user.userId, request.ids);
    return { unread: await this.centre.unreadCount(user.userId) };
  }

  @Get(routes.notifications.preferences)
  async getPreferences(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreferences> {
    return this.preferences.get(user.userId);
  }

  @Put(routes.notifications.preferences)
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(notificationPreferencesSchema)) request: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    return this.preferences.update(user.userId, request);
  }

  /**
   * The live stream.
   *
   * Capped per customer: a page with a leaking effect can otherwise open a connection on
   * every render and exhaust the server's sockets one browser tab at a time.
   */
  @Sse(routes.notifications.stream)
  streamNotifications(@CurrentUser() user: AuthenticatedUser): Observable<ServerSentEvent> {
    if (this.stream.isAtConnectionLimit(user.userId)) {
      throw AppError.forbidden(
        'You have too many live connections open. Close a tab and try again.',
      );
    }

    return this.stream
      .streamFor(user.userId)
      .pipe(map((event) => ({ type: event.event, data: JSON.stringify(event.data) })));
  }

  @Post(routes.notifications.pushSubscribe)
  @HttpCode(HttpStatus.CREATED)
  async subscribeToPush(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(pushSubscriptionRequestSchema)) request: PushSubscriptionRequest,
  ): Promise<PushSubscriptionAccepted> {
    const now = this.clock.now();

    await this.pushSubscriptions.upsert(
      {
        userId: user.userId,
        endpoint: request.endpoint,
        p256dh: request.keys.p256dh,
        auth: request.keys.auth,
        deviceLabel: request.deviceLabel ?? null,
      },
      now,
    );

    return { subscribed: true, registeredAt: now.toISOString() };
  }
}
