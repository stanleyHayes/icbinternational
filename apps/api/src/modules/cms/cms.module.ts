import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuditModule } from '../audit/index.js';
import { RbacModule } from '../rbac/index.js';

import { ContentInstallerService } from './catalogue/content-installer.service.js';
import { CmsAdminController } from './cms-admin.controller.js';
import { CONTENT_MODEL, REVISION_MODEL } from './cms.constants.js';
import { ContentRepository } from './content.repository.js';
import { ContentSchema, RevisionSchema } from './content.schema.js';
import { ContentService } from './content.service.js';
import { ContentStore } from './content.store.js';
import { LocationService } from './locations/location.service.js';
import { PublishingService } from './publishing/publishing.service.js';

/**
 * Content: pages, posts, FAQs, rates, fees, the branch directory and legal documents.
 *
 * One collection and one workflow for all of them — see `cms.constants.ts` for why.
 *
 * `ContentService` and `LocationService` are exported because the public API reads through
 * them rather than reaching into the store. That is what keeps the public surface unable
 * to see an unpublished document: it has no method that would return one.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CONTENT_MODEL, schema: ContentSchema },
      { name: REVISION_MODEL, schema: RevisionSchema },
    ]),
    ClockModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [CmsAdminController],
  providers: [
    { provide: ContentStore, useClass: ContentRepository },
    ContentService,
    PublishingService,
    LocationService,
    ContentInstallerService,
    IdGenerator,
  ],
  exports: [ContentService, PublishingService, LocationService, ContentStore],
})
export class CmsModule {}
