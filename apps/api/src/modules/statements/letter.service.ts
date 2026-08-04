/**
 * The letters the bank will write about a customer's accounts.
 *
 * Like statements, letters are derived rather than stored. A letter says what the bank's
 * records said on a given date, and those records are already kept — so the register of
 * "letters issued" would be a second copy of facts the ledger and the KYC file already
 * hold, with its own way of going stale. Asking for the same letter twice therefore
 * produces the same letter, with the same reference, rather than a second one.
 *
 * The consequence to know about: the list is what the bank *will* attest to for this
 * customer right now, each entry downloadable on the spot. It is not a history of who
 * asked for what — that is the audit trail's job, and `@Audited()` on the issue route is
 * where it is recorded.
 */

import { Injectable } from '@nestjs/common';

import {
  AccountStatus,
  ErrorCode,
  LetterKind,
  routes,
  type Account,
  type RequestLetter,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { AppConfigService } from '../../config/config.service.js';
import { AccountService, type AccountRecord } from '../accounts/index.js';

import { CustomerIdentityService } from './customer-identity.service.js';
import { renderLetterPdf } from './documents/letter.pdf.js';
import { DownloadLinkService } from './download-link.service.js';
import { LetterFactsService } from './letter-facts.service.js';
import { decodeLetterId, letterId, LETTER_KINDS } from './letter-id.js';
import { type RenderedDocument } from './statement-document.service.js';
import { isoDay } from './statement-period.js';
import { DOCUMENT_SEGMENT } from './statements.constants.js';
import { type BankLetter, type ListDocumentsQuery } from './statements.dto.js';

const LAST_MILLISECOND = 86_399_999;

@Injectable()
export class LetterService {
  constructor(
    private readonly accounts: AccountService,
    private readonly identity: CustomerIdentityService,
    private readonly facts: LetterFactsService,
    private readonly links: DownloadLinkService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /** Every letter the bank will write for this customer today, one per account and kind. */
  async list(userId: string, query: ListDocumentsQuery): Promise<PageResult<BankLetter>> {
    const [accounts, identity] = await Promise.all([
      this.accounts.list(userId, { status: AccountStatus.ACTIVE }),
      this.identity.of(userId),
    ]);

    const available = accounts.flatMap((account) =>
      LETTER_KINDS.filter((kind) => offered(kind, account, identity.address !== null)).map((kind) =>
        this.present({ accountId: account.id, kind, asOf: this.clock.startOfDay() }),
      ),
    );

    // The order is a pure function of the customer's accounts and the fixed list of kinds,
    // so resuming after an identifier is stable in a way an offset into a derived list
    // would not be — a newly opened account shifts positions but not identifiers.
    const from = startAfter(available, query.cursor);

    return buildPage({
      records: available.slice(from, from + query.limit + 1),
      limit: query.limit,
      toCursor: (letter) => ({ sortValue: letter.issuedAt, id: letter.id }),
      total: available.length,
    });
  }

  /** Issues one letter, dated today or as at a date the customer chose. */
  async issue(userId: string, request: RequestLetter): Promise<BankLetter> {
    const account = await this.accounts.requireOwned({ userId, accountId: request.accountId });
    assertOpen(account);

    const asOf = this.asOfDate(request.asOfDate);
    const identity = await this.identity.of(userId);
    if (!offered(request.kind, account, identity.address !== null))
      throw notAvailable(request.kind);

    return this.present({
      accountId: account.id,
      kind: request.kind,
      asOf,
      addressedTo: request.addressedTo ?? null,
    });
  }

  /**
   * Renders a letter a signed link named.
   *
   * The signature is the authority — it was issued to a caller whose ownership had
   * already been checked — so no `userId` reaches this path. The account is still loaded,
   * because the letter has to say whose it is.
   */
  async render(input: {
    accountId: string;
    letterId: string;
    addressedTo: string | null;
  }): Promise<RenderedDocument> {
    const decoded = decodeLetterId(input.letterId, input.accountId);
    if (!decoded) throw AppError.notFound('Letter', input.letterId);

    const account = await this.accounts.require(input.accountId);
    const closeOfDay = new Date(decoded.asOf.getTime() + LAST_MILLISECOND);

    const body = await renderLetterPdf(decoded.kind, {
      bank: this.config.bank.name,
      identity: await this.identity.of(account.userId),
      account,
      balance: await this.facts.balanceAsOf(account, closeOfDay),
      interest: await this.facts.interestBetween(account, yearBefore(decoded.asOf), closeOfDay),
      asOfDay: isoDay(decoded.asOf),
      openedDay: isoDay(account.openedAt),
      reference: input.letterId,
      addressedTo: input.addressedTo,
    });

    return {
      body,
      contentType: 'application/pdf',
      filename: `${decoded.kind.toLowerCase()}_${isoDay(decoded.asOf)}.pdf`,
    };
  }

  /** A letter cannot speak for a date the bank has not reached. */
  private asOfDate(requested: string | undefined): Date {
    const today = this.clock.startOfDay();
    if (!requested) return today;

    const asOf = new Date(`${requested}T00:00:00.000Z`);
    if (Number.isNaN(asOf.getTime()) || asOf > today) {
      throw new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'A letter can only be dated today or earlier.',
      });
    }

    return asOf;
  }

  private present(input: {
    accountId: string;
    kind: LetterKind;
    asOf: Date;
    addressedTo?: string | null;
  }): BankLetter {
    const addressedTo = input.addressedTo ?? null;
    const id = letterId({ accountId: input.accountId, kind: input.kind, asOf: input.asOf });
    const path = `${routes.accounts.letters}/${id}/${DOCUMENT_SEGMENT}`;
    const query = {
      account: input.accountId,
      ...(addressedTo ? { addressedTo } : {}),
    };

    return {
      id,
      kind: input.kind,
      accountId: input.accountId,
      addressedTo,
      downloadUrl: this.links.sign(path, query),
      issuedAt: this.clock.now().toISOString(),
      expiresAt: this.links.expiresAt().toISOString(),
    };
  }
}

/**
 * Which letters the bank will write about an account.
 *
 * A certificate of interest for an account that pays none, and a confirmation of an
 * address nobody has verified, are both documents the bank cannot stand behind — so they
 * are never offered rather than offered and then found to be empty.
 */
function offered(kind: LetterKind, account: Account | AccountRecord, hasAddress: boolean): boolean {
  if (kind === LetterKind.INTEREST_CERTIFICATE) return account.interestRateBps !== null;
  if (kind === LetterKind.PROOF_OF_ADDRESS) return hasAddress;
  return true;
}

/** Where the next page begins. An unrecognised cursor restarts rather than empties. */
function startAfter(letters: readonly BankLetter[], cursor: string | undefined): number {
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (!decoded) return 0;

  const index = letters.findIndex((letter) => letter.id === decoded.id);
  return index === -1 ? 0 : index + 1;
}

function yearBefore(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear() - 1, at.getUTCMonth(), at.getUTCDate()));
}

function assertOpen(account: AccountRecord): void {
  if (account.status === AccountStatus.ACTIVE) return;

  throw new AppError({
    code: ErrorCode.ACCOUNT_FROZEN,
    message: 'We can write letters about an account that is open and operating normally.',
    context: { accountId: account.id, status: account.status },
  });
}

function notAvailable(kind: LetterKind): AppError {
  const reason =
    kind === LetterKind.INTEREST_CERTIFICATE
      ? 'This account does not pay interest, so there is nothing to certify.'
      : 'We can confirm an address once identity verification is complete.';

  return new AppError({ code: ErrorCode.FEATURE_DISABLED, message: reason, context: { kind } });
}
