/**
 * Domain errors raised by the ledger.
 *
 * These are deliberately plain classes with no framework coupling: the domain layer must
 * remain testable without NestJS. The API's exception filter maps them onto contract
 * error codes at the boundary.
 */

export abstract class LedgerError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The cardinal sin: debits and credits do not agree. */
export class UnbalancedEntryError extends LedgerError {
  constructor(
    readonly currency: string,
    readonly debits: bigint,
    readonly credits: bigint,
  ) {
    super(
      `Journal entry does not balance in ${currency}: debits ${debits} vs credits ${credits}. ` +
        'An entry that does not balance is never written — this is a defect in the caller.',
    );
  }
}

export class EmptyEntryError extends LedgerError {
  constructor() {
    super('A journal entry needs at least two postings — one debit and one credit.');
  }
}

export class NonPositivePostingError extends LedgerError {
  constructor(readonly amount: bigint) {
    super(
      `Posting amount must be greater than zero, received ${amount}. Direction carries the ` +
        'sign — a negative debit is a credit, and expressing it as one keeps the ledger readable.',
    );
  }
}

export class UnknownLedgerAccountError extends LedgerError {
  constructor(readonly code: string) {
    super(`No general-ledger account with code ${code} exists in the chart of accounts.`);
  }
}

export class ControlAccountPostingError extends LedgerError {
  constructor(readonly code: string) {
    super(
      `GL ${code} is a control account. It is credited automatically as the counterparty of a ` +
        'customer posting and must never be posted to directly.',
    );
  }
}
