/**
 * Accounts, balances, statements and letters.
 *
 * `balance` is its own call rather than a field a caller re-reads off `get`. A dashboard
 * polls the balance far more often than it needs the product terms and the IBAN, and
 * splitting them keeps the hot path small.
 */

import {
  accountSchema,
  balanceSchema,
  netWorthSchema,
  paginated,
  resource,
  routes,
  statementSchema,
  type Account,
  type Balance,
  type CloseAccountRequest,
  type CursorQuery,
  type ListAccountsQuery,
  type NetWorth,
  type OpenAccountRequest,
  type Paginated,
  type RequestLetter,
  type RequestStatement,
  type Resource,
  type Statement,
  type UpdateAccountRequest,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import { bankLetterSchema, type BankLetter } from '../provisional/documents.js';

const accountList = paginated(accountSchema);
const accountResource = resource(accountSchema);
const balanceResource = resource(balanceSchema);
const netWorthResource = resource(netWorthSchema);
const statementList = paginated(statementSchema);
const statementResource = resource(statementSchema);
const letterList = paginated(bankLetterSchema);
const letterResource = resource(bankLetterSchema);

/** Builds the `client.accounts` group. */
export function createAccountsResource(http: HttpTransport) {
  return {
    /** The customer's accounts, optionally filtered by status, type or currency. */
    list: (query?: ListAccountsQuery, options?: QueryOptions): Promise<Paginated<Account>> =>
      http.get({ ...options, path: routes.accounts.list, query, schema: accountList }),

    /** Opens an account against a product code. */
    create: (body: OpenAccountRequest, options?: MutationOptions): Promise<Resource<Account>> =>
      http.post({ ...options, path: routes.accounts.create, body, schema: accountResource }),

    /** One account, with its balance projection embedded. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Account>> =>
      http.get({ ...options, path: routes.accounts.byId(id), schema: accountResource }),

    /** Renames an account or makes it the primary one. */
    update: (
      id: string,
      body: UpdateAccountRequest,
      options?: MutationOptions,
    ): Promise<Resource<Account>> =>
      http.patch({ ...options, path: routes.accounts.byId(id), body, schema: accountResource }),

    /**
     * The balance alone: booked, available, held and overdraft headroom.
     *
     * `available` is the only figure a spending decision may be made against — `ledger`
     * still counts money that authorisations have already spoken for.
     */
    balance: (id: string, options?: QueryOptions): Promise<Resource<Balance>> =>
      http.get({ ...options, path: routes.accounts.balance(id), schema: balanceResource }),

    /** Closes an account, sweeping any residual balance first. */
    close: (
      id: string,
      body: CloseAccountRequest,
      options?: MutationOptions,
    ): Promise<Resource<Account>> =>
      http.post({ ...options, path: routes.accounts.close(id), body, schema: accountResource }),

    /** Aggregate position across every account, in the customer's base currency. */
    netWorth: (options?: QueryOptions): Promise<Resource<NetWorth>> =>
      http.get({ ...options, path: routes.accounts.netWorth, schema: netWorthResource }),

    /** Statements already generated for an account. */
    listStatements: (
      accountId: string,
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Statement>> =>
      http.get({
        ...options,
        path: routes.accounts.statements(accountId),
        query,
        schema: statementList,
      }),

    /** Requests an ad-hoc statement for a date range. */
    requestStatement: (
      accountId: string,
      body: RequestStatement,
      options?: MutationOptions,
    ): Promise<Resource<Statement>> =>
      http.post({
        ...options,
        path: routes.accounts.statements(accountId),
        body,
        schema: statementResource,
      }),

    /** One statement, with a freshly-signed download link. */
    getStatement: (
      accountId: string,
      statementId: string,
      options?: QueryOptions,
    ): Promise<Resource<Statement>> =>
      http.get({
        ...options,
        path: routes.accounts.statement(accountId, statementId),
        schema: statementResource,
      }),

    /** Letters the bank has issued — proof of balance, bank reference and the rest. */
    listLetters: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<BankLetter>> =>
      http.get({ ...options, path: routes.accounts.letters, query, schema: letterList }),

    /** Asks the bank to produce a letter. */
    requestLetter: (
      body: RequestLetter,
      options?: MutationOptions,
    ): Promise<Resource<BankLetter>> =>
      http.post({ ...options, path: routes.accounts.letters, body, schema: letterResource }),
  };
}

/** The `client.accounts` group. */
export type AccountsResource = ReturnType<typeof createAccountsResource>;
