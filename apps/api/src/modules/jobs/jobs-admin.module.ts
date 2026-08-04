import { Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module.js';

import { JobsAdminController } from './jobs-admin.controller.js';
import { JobsModule } from './jobs.module.js';

@Module({
  imports: [JobsModule, RbacModule],
  controllers: [JobsAdminController],
})
export class JobsAdminModule {}
