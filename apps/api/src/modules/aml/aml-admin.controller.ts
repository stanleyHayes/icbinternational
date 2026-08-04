import { Controller, Get, Param, Patch } from '@nestjs/common';

import {
  ErrorCode,
  Permission,
  routes,
  type AmlAlert,
  type AmlCase,
  type AmlRule,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { AdminEndpoint } from '../rbac/index.js';

import { AmlStore } from './aml.store.js';

/** Admin AML: alerts, cases, and rule management. */
@Controller()
export class AmlAdminController {
  constructor(private readonly store: AmlStore) {}

  // --- Alerts ----------------------------------------------------------------

  /** `GET /admin/aml/alerts` — all open and recent alerts, newest first. */
  @Get(routes.admin.amlAlerts)
  @AdminEndpoint(Permission.AML_READ)
  listAlerts(): { data: AmlAlert[] } {
    return { data: this.store.listAlerts() };
  }

  // --- Cases -----------------------------------------------------------------

  /** `GET /admin/aml/cases` — all cases, newest first. */
  @Get(routes.admin.amlCases)
  @AdminEndpoint(Permission.AML_READ)
  listCases(): { data: AmlCase[] } {
    return { data: this.store.listCases() };
  }

  /** `GET /admin/aml/cases/:id` */
  @Get(routes.admin.amlCase(':id'))
  @AdminEndpoint(Permission.AML_READ)
  getCase(@Param('id') id: string): AmlCase {
    const amlCase = this.store.findCase(id);
    if (!amlCase) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'AML case not found' });
    return amlCase;
  }

  // --- Rules -----------------------------------------------------------------

  /** `GET /admin/aml/rules` — all rules, alphabetical. */
  @Get(routes.admin.amlRules)
  @AdminEndpoint(Permission.AML_READ)
  listRules(): { data: AmlRule[] } {
    return { data: this.store.listRules() };
  }

  /** `GET /admin/aml/rules/:id` */
  @Get(routes.admin.amlRule(':id'))
  @AdminEndpoint(Permission.AML_READ)
  getRule(@Param('id') id: string): AmlRule {
    const rule = this.store.findRule(id);
    if (!rule) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'AML rule not found' });
    return rule;
  }

  /**
   * `POST /admin/aml/rules/:id/backtest` — dry-run a rule against the last 30 days.
   *
   * Stub: returns `{ matchCount: 0, falsePositiveEstimate: 0 }`. A full implementation
   * would stream the transaction log and evaluate the rule predicate against each row.
   */
  @Patch(routes.admin.backtestRule(':id'))
  @AdminEndpoint(Permission.AML_RULE_WRITE)
  backtest(@Param('id') id: string): { matchCount: number; falsePositiveEstimate: number } {
    const rule = this.store.findRule(id);
    if (!rule) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'AML rule not found' });
    return { matchCount: 0, falsePositiveEstimate: 0 };
  }
}
