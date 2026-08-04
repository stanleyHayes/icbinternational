/**
 * Public surface of the KYC lane.
 *
 * The money-moving lanes need the tier read — `KycTierPort`, fresh on every call — and
 * the operations lanes need the expiry sweep and the case service. Everything else
 * (the schema, the repository internals, the vendor twins) stays private to this
 * folder so the wiring can change without a cross-module edit.
 */

export { KycModule } from './kyc.module.js';
export { KycTierPort } from './kyc-tier.port.js';
export { KycTierService } from './kyc-tier.service.js';
export { KycCaseService } from './kyc-case.service.js';
export { KycExpiryService } from './kyc-expiry.service.js';
export { KycDecisionService, AUTOMATED_DECIDER } from './kyc-decision.service.js';
export { OcrPort, LivenessPort, OcrVerdict, LivenessVerdict } from './ports/kyc-vendor.ports.js';
export { KycCaseRepository } from './kyc-case.repository.js';
