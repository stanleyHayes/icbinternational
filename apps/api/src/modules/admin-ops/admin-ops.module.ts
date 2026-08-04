import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { GlModule } from '../gl/gl.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

import { AdminApprovalsController } from './admin-approvals.controller.js';
import { AdminFlagsController } from './admin-flags.controller.js';
import { AdminJournalEntriesController } from './admin-journal-entries.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminCommsController, AdminFraudRulesController, AdminScreeningController } from './admin-stubs.controller.js';
import { ApprovalStore } from './approval.store.js';
import { FeatureFlagStore } from './feature-flag.store.js';

/**
 * Back-office operations module.
 *
 * Hosts admin controllers that are cross-cutting and do not belong in a single domain
 * module. The design rule is: if a controller needs more than one domain module, it lives
 * here rather than creating a peer-module dependency that would tangle the graph.
 *
 * `LedgerModule` is imported for journal-entry inspection and the GL-level reports.
 * `GlModule` is imported for `TrialBalanceService`, which powers all four report views.
 * `RbacModule` supplies the guard chain for every `@AdminEndpoint()` here.
 */
@Module({
  imports: [LedgerModule, GlModule, RbacModule],
  controllers: [
    AdminApprovalsController,
    AdminFlagsController,
    AdminJournalEntriesController,
    AdminReportsController,
    AdminCommsController,
    AdminFraudRulesController,
    AdminScreeningController,
  ],
  providers: [ApprovalStore, FeatureFlagStore, IdGenerator],
})
export class AdminOperationsModule {}
