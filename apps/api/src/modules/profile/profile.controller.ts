/**
 * The customer's own profile, their data, and the end of the relationship.
 *
 * Every handler scopes by the caller's id from the verified token; no route here takes an
 * identifier that could name somebody else. The ownership rules that do exist live in the
 * services, so they hold for every caller rather than for every caller who remembered.
 *
 * `CsrfGuard` sits on the three mutations and not on the read. These routes authenticate
 * from a cookie, which is precisely what a cross-site request rides on, so every state
 * change carries the double-submit check — but a read cannot be weaponised that way and the
 * client does not send the header on one.
 *
 * `@StepUp()` guards the closure. It is irreversible and it is exactly what somebody does
 * with a session they have taken over, so a stolen session alone must not be enough. It is
 * written above `@UseGuards(JwtAuthGuard, …)` because Nest appends guards bottom-up and the
 * proof is matched against the authenticated user — which cannot happen if nothing has
 * authenticated one. The export deserves the same treatment and does not yet have it; the
 * reason is on that handler.
 *
 * Neither mutation is `@Idempotent()`. Closing is convergent by identity: an already-closed
 * customer is returned success rather than a second closure. An export is not convergent —
 * a repeat genuinely does gather a second copy — but it also moves no money, and requiring a
 * key on it would be the only place in the API where replay protection guarded a read.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  routes,
  updateProfileRequestSchema,
  type Profile,
  type UpdateProfileRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { StepUp } from '../mfa/step-up.decorator.js';

import { DataExportService, type DataExportView } from './data-export.service.js';
import { ProfileChangeNotifier } from './profile-change.notifier.js';
import { ProfileClosureService } from './profile-closure.service.js';
import {
  CUSTOMER_AUDIT_ENTITY,
  PROFILE_AUDIT_CAPTURE_FIELDS,
  PROFILE_AUDIT_ENTITY,
} from './profile.constants.js';
import {
  closeCustomerAccountSchema,
  requestDataExportSchema,
  type CloseCustomerAccount,
  type RequestDataExport,
} from './profile.dto.js';
import { ProfileService } from './profile.service.js';

/**
 * Where the audit interceptor finds the subject.
 *
 * These routes carry no identifier at all — the customer *is* the subject — so the id comes
 * off the authenticated request rather than a path parameter.
 */
const SUBJECT_FROM_TOKEN = 'user.userId';

@Controller()
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly changes: ProfileChangeNotifier,
    private readonly exports: DataExportService,
    private readonly closure: ProfileClosureService,
  ) {}

  /** The signed-in customer's own details. */
  @Get(routes.profile.get)
  @UseGuards(JwtAuthGuard)
  async get(@CurrentUser() user: AuthenticatedUser): Promise<Profile> {
    return this.profiles.get(user.userId);
  }

  /**
   * Changes some of them.
   *
   * The customer is told what changed on the way out. Announcing it is a security control
   * rather than a courtesy — a change made without their knowledge is the first step in an
   * account takeover — so it happens here, on the one route that can make one.
   */
  @Patch(routes.profile.update)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({
    action: 'profile.update',
    entity: PROFILE_AUDIT_ENTITY,
    entityIdFrom: SUBJECT_FROM_TOKEN,
    captureFields: PROFILE_AUDIT_CAPTURE_FIELDS,
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateProfileRequestSchema)) request: UpdateProfileRequest,
  ): Promise<Profile> {
    const updated = await this.profiles.update(user.userId, request);
    await this.changes.announce(user.userId, updated.changed);
    return updated.profile;
  }

  /**
   * A copy of everything the bank holds about the customer.
   *
   * Not behind `@StepUp()`, and that is a compromise rather than a judgement that it is
   * safe. The export hands over one file containing everything we know about a person, so
   * it belongs behind a re-authentication on the same reasoning as closure — but the
   * settings screen posts here with no step-up prompt and no token, so gating it would turn
   * "Request my data" into an error the customer cannot clear. It should be gated the moment
   * the privacy panel grows the prompt that the closure panel already has.
   */
  @Post(routes.profile.exportData)
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({
    action: 'profile.export',
    entity: CUSTOMER_AUDIT_ENTITY,
    entityIdFrom: SUBJECT_FROM_TOKEN,
  })
  async requestDataExport(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(requestDataExportSchema)) request: RequestDataExport,
  ): Promise<DataExportView> {
    return this.exports.request(user.userId, request);
  }

  /**
   * Closes every account and ends the relationship.
   *
   * Answers `PRECONDITION_FAILED` with every reason at once while anything is still in the
   * way, and changes nothing when it does.
   */
  @Post(routes.profile.closeAccount)
  @HttpCode(HttpStatus.OK)
  @StepUp()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({
    action: 'profile.close',
    entity: CUSTOMER_AUDIT_ENTITY,
    entityIdFrom: SUBJECT_FROM_TOKEN,
  })
  async closeAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(closeCustomerAccountSchema)) request: CloseCustomerAccount,
  ): Promise<{ acknowledged: true }> {
    await this.closure.close(user.userId, request);
    return { acknowledged: true };
  }
}
