import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClockModule } from '../../common/clock/clock.module.js';
import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigService } from '../../config/config.service.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';

import { FileAssetRepository } from './file-asset.repository.js';
import { FileAssetSchema } from './file-asset.schema.js';
import { FileAssetStore } from './file-asset.store.js';
import { FILE_ASSET_MODEL, UPLOAD_TICKET_MODEL } from './files.constants.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { CloudinaryMediaStorage } from './ports/cloudinary-media-storage.js';
import { InMemoryMediaStorage } from './ports/in-memory-media-storage.js';
import { MediaStoragePort } from './ports/media-storage.port.js';
import { UploadHandshakeService } from './upload-handshake.service.js';
import { UploadTicketRepository } from './upload-ticket.repository.js';
import { UploadTicketSchema } from './upload-ticket.schema.js';
import { UploadTicketStore } from './upload-ticket.store.js';

/**
 * The file register and the object store behind it.
 *
 * `MediaStoragePort` is bound at boot from configuration rather than from an environment
 * check scattered through the services. With Cloudinary configured the API talks to it;
 * without, the in-process twin takes over and every upload path keeps working. That is a
 * deliberate choice: a developer who has not signed up for a media provider should still
 * be able to complete onboarding end to end, and an unset variable should never surface
 * to a customer as a broken button.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FILE_ASSET_MODEL, schema: FileAssetSchema },
      { name: UPLOAD_TICKET_MODEL, schema: UploadTicketSchema },
    ]),
    ClockModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [FilesController],
  providers: [
    { provide: FileAssetStore, useClass: FileAssetRepository },
    { provide: UploadTicketStore, useClass: UploadTicketRepository },
    {
      provide: MediaStoragePort,
      inject: [AppConfigService, ClockService],
      useFactory: (config: AppConfigService, clock: ClockService): MediaStoragePort =>
        config.media.enabled
          ? new CloudinaryMediaStorage(config, clock)
          : new InMemoryMediaStorage(clock),
    },
    FilesService,
    UploadHandshakeService,
    IdGenerator,
  ],
  exports: [FilesService, UploadHandshakeService, FileAssetStore, MediaStoragePort],
})
export class FilesModule {}
