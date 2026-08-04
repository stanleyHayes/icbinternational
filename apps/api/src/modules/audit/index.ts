/**
 * Public surface of the audit trail.
 *
 * Feature modules need three things: the `@Audited()` decorator, the `AuditSubjectLoader`
 * interface their repository implements, and — for changes that do not map onto an HTTP
 * handler, such as a scheduled interest run — `AuditService` itself. Everything else,
 * including the repository and the hashing, is internal and stays that way.
 */

export { AuditModule } from './audit.module.js';
export { AuditService, type RecordAuditInput } from './audit.service.js';
export { AuditVerifierService } from './audit-verifier.service.js';
export {
  Audited,
  AUDITED_METADATA,
  type AuditedOptions,
  type AuditSubjectLoader,
} from './audited.decorator.js';
export {
  AuditActorType,
  type AuditActor,
  type AuditChainVerification,
  type AuditChange,
} from './audit.types.js';
export { canonicalJson } from './canonical-json.js';
