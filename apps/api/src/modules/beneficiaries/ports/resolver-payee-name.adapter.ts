import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type TransferDestination } from '@reliance/contracts';

import { PayeeResolverService } from '../payee-resolver.service.js';

import { PayeeNamePort } from './payee-name.port.js';

/**
 * {@link PayeeNamePort} answered from the bank's own records.
 *
 * Reliance is the receiving bank for an internal destination, so Confirmation of Payee is
 * a real check with a real answer. For a destination at another institution there is
 * nothing to ask — the domestic and international rails (D-03, D-04) will implement this
 * port against their scheme simulators — and this adapter returns null rather than
 * guessing, which surfaces as `UNAVAILABLE`.
 */
@Injectable()
export class ResolverPayeeNameAdapter extends PayeeNamePort {
  constructor(private readonly payees: PayeeResolverService) {
    super();
  }

  override async nameFor(
    destination: TransferDestination,
    session?: ClientSession,
  ): Promise<string | null> {
    if (destination.kind !== 'INTERNAL') return null;

    // The payer is irrelevant to a name check, and passing an id that owns nothing keeps
    // `ownAccount` honestly false rather than letting the caller's identity leak into the
    // answer. An unresolvable payee comes back as null, not as an error — that is the
    // difference between `resolve` and `require`, and the reason this uses the former.
    const resolved = await this.payees.resolve({
      destination,
      payerUserId: NO_PAYER,
      ...(session ? { session } : {}),
    });

    return resolved?.holderName ?? null;
  }
}

/** A user id no account can be held by, so `ownAccount` cannot accidentally be true. */
const NO_PAYER = '';
