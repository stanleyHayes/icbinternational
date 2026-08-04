/**
 * Public surface of the file register.
 *
 * Other lanes need three things: the service, the storage port (so a module can bind its
 * own twin in a test), and the purpose vocabulary that decides whether material is
 * publicly addressable.
 */

export { FilesModule } from './files.module.js';
export { FilesService, type StoreBytesCommand } from './files.service.js';
export {
  UploadHandshakeService,
  type ConfirmUploadCommand,
  type SignUploadCommand,
} from './upload-handshake.service.js';

export {
  AssetPurpose,
  AssetVisibility,
  MAX_UPLOAD_BYTES,
  RESTRICTED_PURPOSES,
} from './files.constants.js';

export { FileAssetStore, type FileAssetRecord, type NewFileAsset } from './file-asset.store.js';
export { InMemoryFileAssetStore } from './in-memory-file-asset.store.js';

export {
  UploadTicketStore,
  type NewUploadTicket,
  type UploadTicketRecord,
} from './upload-ticket.store.js';
export { InMemoryUploadTicketStore } from './in-memory-upload-ticket.store.js';

export {
  MediaStoragePort,
  type MediaTransform,
  type SignedUploadTicket,
  type StoredAsset,
} from './ports/media-storage.port.js';
export { InMemoryMediaStorage } from './ports/in-memory-media-storage.js';
export { visibilityFor } from './asset-visibility.js';

export {
  assessUpload,
  describeAllowed,
  ALLOWED_TYPES,
  type UploadVerdict,
} from './upload-policy.js';
export { sniffContent, HostileType, SniffedType, type SniffOutcome } from './content-sniffer.js';
