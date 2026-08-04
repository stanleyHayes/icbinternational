/**
 * The statements module's public surface.
 *
 * Other lanes want two things from here: the ability to produce a statement's figures for
 * a period — the closing balance an interest run or a dispute investigation quotes — and
 * the rendered document itself. Nothing else is exported, because nothing else is anybody
 * else's business: the identifier encoding, the copy and the PDF layout can all change
 * without a cross-module edit.
 */

export { StatementsModule } from './statements.module.js';

export { StatementService, type ResolvedStatement } from './statement.service.js';
export {
  StatementBuilderService,
  type PeriodSummary,
  type StatementDetail,
} from './statement-builder.service.js';
export { StatementDocumentService, type RenderedDocument } from './statement-document.service.js';
export { LetterService } from './letter.service.js';
export { LetterFactsService } from './letter-facts.service.js';
export { CustomerIdentityService, type CustomerIdentity } from './customer-identity.service.js';
export { DownloadLinkService, type SignedQuery } from './download-link.service.js';

export { summarise, type StatementFigures } from './statement-figures.js';
export {
  archivePeriods,
  customPeriod,
  isoDay,
  monthlyPeriod,
  type StatementPeriod,
} from './statement-period.js';
export { decodeStatementId, statementId, type DecodedStatementId } from './statement-id.js';
export { decodeLetterId, letterId, LETTER_KINDS, type DecodedLetterId } from './letter-id.js';
export { toContractStatement, type StatementView } from './statement.mapper.js';

export { bankLetterSchema, type BankLetter } from './statements.dto.js';
export {
  DOWNLOAD_LINK_TTL_SECONDS,
  LETTER_VALIDITY_DAYS,
  MAX_STATEMENT_DAYS,
  STATEMENT_ARCHIVE_MONTHS,
  STATEMENT_RETENTION_YEARS,
} from './statements.constants.js';
