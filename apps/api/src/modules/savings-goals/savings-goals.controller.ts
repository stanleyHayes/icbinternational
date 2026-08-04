/**
 * A customer's savings goals.
 *
 * Every handler resolves the goal through the caller's id, so a request for somebody
 * else's goal answers "not found" rather than confirming it exists. Round-ups have no
 * endpoint here at all — they are applied by the cards lane as spend settles, through the
 * exported {@link GoalAutomationService}, because a customer never asks for one.
 */

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
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  createGoalRequestSchema,
  routes,
  type CreateGoalRequest,
  type Goal,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { GoalService } from './goal.service.js';
import {
  contributeToGoalRequestSchema,
  setAutoSaveRequestSchema,
  updateGoalRequestSchema,
  withdrawFromGoalRequestSchema,
  type ContributeToGoalRequest,
  type SetAutoSaveRequest,
  type UpdateGoalRequest,
  type WithdrawFromGoalRequest,
} from './savings-goals.dto.js';

const ID_PARAM = 'id';
const GOAL_ROUTE = routes.save.goal(`:${ID_PARAM}`);
const AUTO_SAVE_ROUTE = `${GOAL_ROUTE}/auto-save`;

@Controller()
@UseGuards(JwtAuthGuard)
export class SavingsGoalsController {
  constructor(private readonly goals: GoalService) {}

  @Get(routes.save.goals)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Goal[]> {
    return this.goals.list(user.userId);
  }

  /** Opens a goal. It starts empty; funding it is a separate, explicit act. */
  @Post(routes.save.goals)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createGoalRequestSchema)) request: CreateGoalRequest,
  ): Promise<Goal> {
    return this.goals.create(user.userId, request);
  }

  @Get(GOAL_ROUTE)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) goalId: string,
  ): Promise<Goal> {
    return this.goals.get(user.userId, goalId);
  }

  /** Edits the name, target, deadline or round-up setting. */
  @Patch(GOAL_ROUTE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) goalId: string,
    @Body(zodBody(updateGoalRequestSchema)) request: UpdateGoalRequest,
  ): Promise<Goal> {
    return this.goals.update({ userId: user.userId, goalId, request });
  }

  /** Moves money from the linked account into the goal. */
  @Post(routes.save.contribute(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  async contribute(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) goalId: string,
    @Body(zodBody(contributeToGoalRequestSchema)) request: ContributeToGoalRequest,
  ): Promise<Goal> {
    return this.goals.contribute({ userId: user.userId, goalId, request });
  }

  /** Moves money back out. No notice period and no minimum. */
  @Post(routes.save.withdraw(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) goalId: string,
    @Body(zodBody(withdrawFromGoalRequestSchema)) request: WithdrawFromGoalRequest,
  ): Promise<Goal> {
    return this.goals.withdraw({ userId: user.userId, goalId, request });
  }

  /** Sets up, changes or cancels an automatic contribution. Send null to cancel. */
  @Put(AUTO_SAVE_ROUTE)
  async autoSave(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) goalId: string,
    @Body(zodBody(setAutoSaveRequestSchema)) request: SetAutoSaveRequest,
  ): Promise<Goal> {
    return this.goals.setAutoSave({ userId: user.userId, goalId, request });
  }

  /** Closes a goal, returning whatever is in it to the linked account first. */
  @Delete(GOAL_ROUTE)
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) goalId: string,
  ): Promise<Goal> {
    return this.goals.close(user.userId, goalId);
  }
}
