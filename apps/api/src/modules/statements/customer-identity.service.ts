/**
 * Who the bank says the customer is, for the letters that have to say it.
 *
 * A letter is only worth anything to the landlord or the embassy reading it if the name
 * and address on it are the ones the bank verified. That address lives in the KYC case,
 * sealed with the same cipher that protects TOTP secrets, so this reads it there rather
 * than accepting whatever the request typed — a bank cannot confirm an address it was
 * handed by the person asking for the confirmation.
 *
 * The address is decrypted for exactly as long as it takes to render a page and is never
 * projected onto a JSON response by this module.
 *
 * `openPii` is reached for directly rather than through the KYC lane's `index.ts`, which
 * exposes the case service but no accessor for the sealed answers. A proposal to add a
 * narrow `verifiedAddressOf(userId)` there — and delete this reach-in — belongs with that
 * lane rather than this one.
 */

import { Injectable } from '@nestjs/common';

import { KycStatus, type Address } from '@reliance/contracts';

import { SecretCipher } from '../auth/support/secret-cipher.js';
import { UsersService } from '../auth/users/index.js';
import { KycCaseService } from '../kyc/index.js';
import { openPii } from '../kyc/kyc-pii.js';

/** The customer as a letter names them. */
export interface CustomerIdentity {
  readonly name: string;
  /** Null until identity verification has been completed and an address recorded. */
  readonly address: Address | null;
}

@Injectable()
export class CustomerIdentityService {
  constructor(
    private readonly users: UsersService,
    private readonly kyc: KycCaseService,
    private readonly cipher: SecretCipher,
  ) {}

  async of(userId: string): Promise<CustomerIdentity> {
    const user = await this.users.requireById(userId);
    return { name: `${user.firstName} ${user.lastName}`, address: await this.addressOf(userId) };
  }

  /**
   * The address on the customer's verified identity record, or null.
   *
   * Only an approved case counts. An address supplied during an application the bank has
   * not yet accepted is a claim, and a letter repeating it would present a claim as a
   * verification — as would one from a case that has since lapsed, which is why the read
   * goes through the case service and its expiry check rather than straight to the row.
   */
  private async addressOf(userId: string): Promise<Address | null> {
    const kycCase = await this.kyc.getStatus(userId);
    if (kycCase.status !== KycStatus.APPROVED) return null;

    return openPii(this.cipher, kycCase.pii).address ?? null;
  }
}

/** An address on one line, as it is set on a letter. */
export function formatAddress(address: Address): string[] {
  return [
    address.line1,
    address.line2 ?? null,
    address.city,
    address.region ?? null,
    address.postalCode,
    address.country,
  ].filter((line): line is string => line !== null);
}
