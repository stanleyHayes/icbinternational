import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createBeneficiaryRequestSchema,
  routes,
  type Beneficiary,
  type CreateBeneficiaryRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import {
  listBeneficiariesQuerySchema,
  updateBeneficiaryRequestSchema,
  verifyPayeeNameRequestSchema,
  type ListBeneficiariesQuery,
  type UpdateBeneficiaryRequest,
  type VerifyPayeeNameRequest,
  type VerifyPayeeNameResponse,
} from './beneficiaries.dto.js';
import { toContractBeneficiary } from './beneficiary.mapper.js';
import { BeneficiaryService } from './beneficiary.service.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'beneficiary';

/**
 * The customer's saved payees.
 *
 * Every handler takes the caller's id from the verified token and passes it into the
 * service, which scopes the query by it rather than checking ownership afterwards — so
 * there is no route here that can address another customer's address book.
 *
 * Adding and removing a payee are audited. Both are steps in the fraud pattern that
 * matters most: a payee appearing shortly before a large payment is the single most useful
 * signal an investigator has, and it is worth nothing if it was never recorded.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class BeneficiariesController {
  constructor(private readonly beneficiaries: BeneficiaryService) {}

  @Get(routes.beneficiaries.list)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listBeneficiariesQuerySchema)) query: ListBeneficiariesQuery,
  ): Promise<Beneficiary[]> {
    return this.beneficiaries.list(user.userId, query.favouritesOnly);
  }

  /**
   * Declared before `byId`, and it has to be.
   *
   * Nest matches in declaration order, so `/beneficiaries/verify-name` registered after
   * `/beneficiaries/:id` would be swallowed by it and answered with "no such payee".
   */
  @Post(routes.beneficiaries.verifyName)
  @HttpCode(HttpStatus.OK)
  async verifyName(
    @Body(zodBody(verifyPayeeNameRequestSchema)) request: VerifyPayeeNameRequest,
  ): Promise<VerifyPayeeNameResponse> {
    return this.beneficiaries.verify(request.destination, request.accountName);
  }

  @Post(routes.beneficiaries.create)
  @HttpCode(HttpStatus.CREATED)
  @Audited({ action: 'beneficiary.create', entity: AUDIT_ENTITY })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createBeneficiaryRequestSchema)) request: CreateBeneficiaryRequest,
  ): Promise<Beneficiary> {
    const record = await this.beneficiaries.create({ userId: user.userId, request });
    return toContractBeneficiary(record);
  }

  @Get(routes.beneficiaries.byId(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) beneficiaryId: string,
  ): Promise<Beneficiary> {
    return this.beneficiaries.get(user.userId, beneficiaryId);
  }

  @Patch(routes.beneficiaries.byId(`:${ID_PARAM}`))
  @Audited({ action: 'beneficiary.update', entity: AUDIT_ENTITY })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) beneficiaryId: string,
    @Body(zodBody(updateBeneficiaryRequestSchema)) request: UpdateBeneficiaryRequest,
  ): Promise<Beneficiary> {
    return this.beneficiaries.update(user.userId, beneficiaryId, request);
  }

  @Delete(routes.beneficiaries.byId(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: 'beneficiary.remove', entity: AUDIT_ENTITY })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) beneficiaryId: string,
  ): Promise<void> {
    await this.beneficiaries.remove(user.userId, beneficiaryId);
  }
}
