/**
 * Public surface of the CMS.
 *
 * The public API consumes `ContentService` and `LocationService` and nothing else. Neither
 * exposes a method that returns an unpublished document, which is how the boundary in
 * `modules/public` is enforced by the type system rather than by a filter someone has to
 * remember to apply.
 */

export { CmsModule } from './cms.module.js';
export { ContentService, type CreateContentInput } from './content.service.js';
export { PublishingService } from './publishing/publishing.service.js';
export { LocationService, type LocationSearch } from './locations/location.service.js';

export { ContentKind, PUBLICLY_READABLE_KINDS } from './cms.constants.js';
export { ContentStore, type ContentRecord, type ContentQuery } from './content.store.js';
export { InMemoryContentStore } from './in-memory-content.store.js';

export { toArticle, toCmsPage, toFaq } from './content.mapper.js';

export {
  availableActions,
  isPubliclyVisible,
  transition,
  ContentAction,
} from './publishing/workflow.js';
export { mintPreviewToken, verifyPreviewToken } from './publishing/preview-token.js';

export {
  boundingBox,
  distanceMetres,
  parsePoint,
  toDecimalDegrees,
  toMicrodegrees,
  type Point,
} from './locations/geo.js';

export { ContentInstallerService } from './catalogue/content-installer.service.js';
