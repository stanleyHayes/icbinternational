/**
 * Statements and bank letters.
 *
 * ## Registration order matters
 *
 * This module serves `/accounts/letters`, and `AccountsModule` serves `/accounts/:id`.
 * Nest matches routes in the order their controllers are registered, so
 * **`StatementsModule` must be imported before `AccountsModule` in the application root**
 * — the other way round and every letters request is answered "no such account". It is
 * the same hazard `AccountsController` already handles internally by declaring
 * `/accounts/net-worth` above `/accounts/:id`; across modules the only lever is import
 * order.
 *
 * ## What this module owns, and what it borrows
 *
 * It owns no collection. A statement is a summary of postings the transaction projection
 * already holds and of the balance the ledger already attested to; a letter is a
 * statement of facts the account, the customer record and the KYC file already hold. So
 * every route here is a read, and asking for the same document twice produces the same
 * document rather than a second one.
 *
 * `TransactionsModule` supplies the projection reads. `AccountsModule` supplies
 * `AccountService`, which is where ownership is enforced — a statement for an account the
 * caller does not hold answers 404, never 403. `KycModule` supplies the verified address
 * a confirmation of address is not allowed to take from the request, and `AuthModule` the
 * cipher that opens it, the guards, and the customer's name.
 */

import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { KycModule } from '../kyc/index.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { CustomerIdentityService } from './customer-identity.service.js';
import { DownloadLinkService } from './download-link.service.js';
import { LetterFactsService } from './letter-facts.service.js';
import { LetterService } from './letter.service.js';
import { StatementBuilderService } from './statement-builder.service.js';
import { StatementDocumentService } from './statement-document.service.js';
import { StatementService } from './statement.service.js';
import { StatementsController } from './statements.controller.js';

@Module({
  imports: [AccountsModule, TransactionsModule, AuthModule, KycModule, AuditModule],
  controllers: [StatementsController],
  providers: [
    StatementBuilderService,
    StatementService,
    StatementDocumentService,
    DownloadLinkService,
    CustomerIdentityService,
    LetterFactsService,
    LetterService,
  ],
  exports: [StatementService, StatementDocumentService, LetterService],
})
export class StatementsModule {}
