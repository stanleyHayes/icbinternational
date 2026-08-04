import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  cursorQuerySchema,
  routes,
  type CursorQuery,
  type Device as DeviceView,
} from '@reliance/contracts';

import { type PageResult } from '../../common/pagination/cursor.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { DeviceService } from './device.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * The security screen's device list.
 *
 * Removing a device does two things, in an order that matters: it is blocked first, so a
 * sign-in already in flight on it fails the blocked check, and only then are its live
 * sessions revoked. Reversed, a session minted in the gap would survive on a device the
 * customer believes is gone.
 */
@Controller()
export class DevicesController {
  constructor(
    private readonly devices: DeviceService,
    private readonly sessions: SessionsService,
  ) {}

  /** The customer's known devices, most recently used first. */
  @Get(routes.devices.list)
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(cursorQuerySchema)) page: CursorQuery,
  ): Promise<PageResult<DeviceView>> {
    return this.devices.list(user.userId, page);
  }

  /** Blocks a device and ends every session running on it. */
  @Delete(routes.devices.byId(':id'))
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') deviceId: string,
  ): Promise<null> {
    await this.devices.block(user.userId, deviceId);
    await this.sessions.revokeForDevice(user.userId, deviceId);
    return null;
  }
}
