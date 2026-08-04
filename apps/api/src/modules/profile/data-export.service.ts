/**
 * A copy of everything the bank holds about one customer.
 *
 * The gathering is synchronous and happens inside the request, under the customer's own
 * authentication. That is deliberate: a job that assembles the data later has to be trusted
 * to scope itself to the right person, whereas a read performed here simply cannot see
 * anybody else — every store call carries the id from the verified token.
 *
 * What is gathered is then sealed with `SecretCipher` and stored against the request. The
 * copy is reported as `QUEUED` rather than `READY` because it is: packaging it into the
 * requested format and handing over a link is a delivery step this lane does not do, and
 * claiming otherwise would put a `downloadUrl` in the response that nothing serves.
 *
 * The categories a copy contains, and the three things it never contains, are documented on
 * `export-identity.service.ts` — read that file before adding a section.
 */

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { SecretCipher } from '../auth/support/secret-cipher.js';

import { DataExportRepository } from './data-export.repository.js';
import { DataExportStatus, type DataExportDocument } from './data-export.schema.js';
import { ExportBankingService } from './export-banking.service.js';
import { ExportIdentityService } from './export-identity.service.js';
import { DATA_EXPORT_TTL_DAYS } from './profile.constants.js';
import { resolveCategories, type RequestDataExport } from './profile.dto.js';

/** The wire shape of a copy. Mirrors the client's `dataExportSchema`. */
export interface DataExportView {
  readonly id: string;
  readonly status: string;
  readonly downloadUrl: string | null;
  readonly includes: readonly string[];
  readonly note: string | null;
  readonly requestedAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string;
}

/** What the customer is told while the copy is being prepared. */
const PREPARING_NOTE =
  'We are putting your copy together. We will email a secure link to the address on your ' +
  'account when it is ready, and the link will work for 30 days.';

@Injectable()
export class DataExportService {
  constructor(
    private readonly exports: DataExportRepository,
    private readonly identity: ExportIdentityService,
    private readonly banking: ExportBankingService,
    private readonly cipher: SecretCipher,
    private readonly clock: ClockService,
  ) {}

  /**
   * Gathers a copy and records the request.
   *
   * @throws {AppError} `VALIDATION_FAILED` when `includes` names a category we do not hold.
   */
  async request(userId: string, body: RequestDataExport): Promise<DataExportView> {
    const categories = resolveCategories(body.includes);
    const payload = await this.gather(userId, categories);

    const record = await this.exports.insertExport({
      userId,
      status: DataExportStatus.QUEUED,
      includes: categories,
      format: body.format,
      payload: this.cipher.seal(JSON.stringify(payload)),
      expiresAt: this.clock.inDays(DATA_EXPORT_TTL_DAYS),
    });

    return toDataExportView(record);
  }

  /**
   * Assembles the requested sections.
   *
   * A `Map` of thunks rather than a chain of `if`s, so adding a section is adding a row and
   * the order the customer asked for is the order they get. Gathered in parallel because the
   * sections are independent reads against different collections.
   */
  private async gather(
    userId: string,
    categories: readonly string[],
  ): Promise<Record<string, unknown>> {
    const sections: Record<string, () => Promise<unknown>> = {
      IDENTITY: () => this.identity.identity(userId),
      PROFILE: () => this.identity.profile(userId),
      ONBOARDING: () => this.identity.onboardingFile(userId),
      ACCOUNTS: () => this.banking.accountsOf(userId),
      CARDS: () => this.banking.cardsOf(userId),
      LOANS: () => this.banking.loansOf(userId),
      DEPOSITS: () => this.banking.depositsOf(userId),
    };

    const wanted = categories.filter((category) => category in sections);
    const gathered = await Promise.all(
      wanted.map(async (category) => [category, await sections[category]?.()] as const),
    );

    return {
      preparedAt: this.clock.now().toISOString(),
      ...Object.fromEntries(gathered),
    };
  }
}

/** A stored request as the client reads it. The sealed payload is never on the wire. */
export function toDataExportView(record: DataExportDocument): DataExportView {
  return {
    id: record.id,
    status: record.status,
    downloadUrl: record.downloadUrl,
    includes: [...record.includes],
    note: record.status === DataExportStatus.READY ? null : PREPARING_NOTE,
    requestedAt: record.createdAt.toISOString(),
    readyAt: record.readyAt?.toISOString() ?? null,
    expiresAt: record.expiresAt.toISOString(),
  };
}
