import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AccountStatus, ErrorCode, type TransferDestination } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { AccountStore, isHeldBy, type AccountRecord } from '../accounts/index.js';

import { PayeeDirectoryPort } from './ports/payee-directory.port.js';

/** An internal destination, resolved to the account that will actually be credited. */
export interface ResolvedPayee {
  readonly account: AccountRecord;
  /** True when the payer holds the destination account themselves. */
  readonly ownAccount: boolean;
  /** The holder's name, for Confirmation of Payee. Null when the directory has none. */
  readonly holderName: string | null;
}

/**
 * The single path from "what the customer typed" to "the account that gets the money".
 *
 * There is one of these on purpose. A transfer resolves a destination to decide where to
 * credit; a name check resolves the same destination to decide whose name to compare; a
 * saved payee resolves it to decide whether it is the same payee as last time. Three
 * copies of that lookup would eventually disagree about which account an email belongs
 * to, and the disagreement would move money.
 *
 * **A failed resolution is always `BENEFICIARY_NOT_FOUND`, never something more specific.**
 * "That email is not registered", "that account number does not exist" and "that account
 * is closed" are three different facts about a stranger, and answering them separately
 * turns this endpoint into a directory of the bank's customers.
 */
@Injectable()
export class PayeeResolverService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly directory: PayeeDirectoryPort,
  ) {}

  /**
   * Resolves an internal destination, or null for a destination on another rail.
   *
   * @param payerUserId Who is paying, so `ownAccount` can be answered.
   * @throws {AppError} `VALIDATION_FAILED` when the destination names no payee at all.
   */
  async resolve(input: {
    destination: TransferDestination;
    payerUserId: string;
    session?: ClientSession;
  }): Promise<ResolvedPayee | null> {
    if (input.destination.kind !== 'INTERNAL') return null;

    assertOneInternalIdentifier(input.destination);
    const account = await this.findAccount(input.destination, input.session);
    if (!account) return null;

    return {
      account,
      ownAccount: isHeldBy(account, input.payerUserId),
      holderName: await this.directory.displayNameOf(account.userId, input.session),
    };
  }

  /** {@link resolve}, but an unresolvable internal destination is a rejection. */
  async require(input: {
    destination: TransferDestination;
    payerUserId: string;
    session?: ClientSession;
  }): Promise<ResolvedPayee> {
    const resolved = await this.resolve(input);
    if (resolved) return resolved;

    throw new AppError({
      code: ErrorCode.BENEFICIARY_NOT_FOUND,
      message: 'We could not find a Reliance account for that payee.',
      context: { kind: input.destination.kind },
    });
  }

  private async findAccount(
    destination: Extract<TransferDestination, { kind: 'INTERNAL' }>,
    session?: ClientSession,
  ): Promise<AccountRecord | null> {
    const account = await this.lookup(destination, session);
    // A closed account is indistinguishable from a non-existent one to an outsider, and
    // must stay that way: revealing "closed" confirms the number was once real.
    return account && account.status !== AccountStatus.CLOSED ? account : null;
  }

  private async lookup(
    destination: Extract<TransferDestination, { kind: 'INTERNAL' }>,
    session?: ClientSession,
  ): Promise<AccountRecord | null> {
    if (destination.accountId) {
      return this.accounts.findById(destination.accountId, session);
    }
    if (destination.accountNumber) {
      return this.accounts.findByNumber(destination.accountNumber, session);
    }

    const userId = destination.email
      ? await this.directory.userByEmail(destination.email, session)
      : await this.directory.userByHandle(destination.handle ?? '', session);

    return userId ? this.receivingAccountOf(userId, session) : null;
  }

  /**
   * Which of a customer's accounts an email or handle payment lands in.
   *
   * Their primary account if they have one, and their oldest active account otherwise.
   * Deterministic either way: a payment addressed to a person must land in the same place
   * every time, or a customer reconciling two months of statements finds their salary
   * split across accounts for reasons nobody can reconstruct.
   */
  private async receivingAccountOf(
    userId: string,
    session?: ClientSession,
  ): Promise<AccountRecord | null> {
    const live = await this.accounts.listByUser({
      userId,
      status: AccountStatus.ACTIVE,
      ...(session ? { session } : {}),
    });

    return live.find((account) => account.isPrimary) ?? oldest(live);
  }
}

/**
 * Exactly one identifier, enforced here because the contract only documents it.
 *
 * `internalDestinationSchema` marks all four optional with a comment saying "exactly one of
 * these identifies the payee" and no `.refine` behind it, so a body naming both an email
 * and somebody else's account number parses cleanly. Silently preferring one would let a
 * caller show the customer a confirmation screen for one payee and pay a different one.
 * See `docs/CONTRACT_CHANGES.md`.
 */
export function assertOneInternalIdentifier(
  destination: Extract<TransferDestination, { kind: 'INTERNAL' }>,
): void {
  const supplied = [
    destination.accountId,
    destination.accountNumber,
    destination.email,
    destination.handle,
  ].filter((identifier) => identifier !== undefined);

  if (supplied.length === 1) return;

  throw AppError.validation('Name the payee exactly one way.', [
    {
      path: 'destination',
      message: 'Supply exactly one of accountId, accountNumber, email or handle',
    },
  ]);
}

function oldest(accounts: readonly AccountRecord[]): AccountRecord | null {
  return (
    [...accounts].sort((left, right) => left.openedAt.getTime() - right.openedAt.getTime())[0] ??
    null
  );
}
