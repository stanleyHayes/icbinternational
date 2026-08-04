import { Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module.js';

import { AmlAdminController } from './aml-admin.controller.js';
import { AmlStore } from './aml.store.js';

/**
 * Anti-money-laundering module.
 *
 * Hosts the in-memory rule catalogue, alert queue, and case management surface.
 * The rule engine (stream evaluation, sanctions screening, PEP matching) is a
 * subsequent increment; this module wires the admin console's read surface.
 */
@Module({
  imports: [RbacModule],
  controllers: [AmlAdminController],
  providers: [AmlStore],
  exports: [AmlStore],
})
export class AmlModule {}
