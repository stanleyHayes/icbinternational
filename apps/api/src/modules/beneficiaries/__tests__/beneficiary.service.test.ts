import { AccountStatus, ErrorCode, NameCheckResult } from '@reliance/contracts';
import { Money } from '@reliance/money';

import {
  gbp,
  OTHER_USER,
  seedAccount,
  TEST_USER,
} from '../../accounts/__tests__/accounts-harness.js';
import { COOLING_OFF_HOURS } from '../beneficiary.constants.js';
import { PayeeTrust } from '../cooling-off.js';
import { destinationKeys, primaryDestinationKey } from '../destination-key.js';

import { beneficiariesRig, type BeneficiariesRig } from './beneficiaries-harness.js';

const ONE_HOUR_MS = 3_600_000;

async function payeeAccount(rig: BeneficiariesRig) {
  const accountId = await seedAccount(rig.accounts, {
    userId: OTHER_USER,
    holderIds: [OTHER_USER],
    ledger: gbp('0'),
  });

  rig.directory.register({
    userId: OTHER_USER,
    email: 'ada@example.com',
    handle: '@ada',
    displayName: 'Ada Lovelace',
  });

  return accountId;
}

function internalRequest(accountId: string, nickname = 'Ada Lovelace') {
  return {
    nickname,
    destination: { kind: 'INTERNAL', accountId } as const,
    currency: 'GBP' as const,
    isFavourite: false,
  };
}

describe('saving a payee', () => {
  it('runs the name check and stores its verdict', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const saved = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId),
    });

    expect(saved.nameCheck).toBe(NameCheckResult.MATCH);
    expect(saved.nameCheckSuggestion).toBeNull();
  });

  it('records a close match with the registered name so the customer can check', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const saved = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId, 'Ada Lovelase'),
    });

    expect(saved.nameCheck).toBe(NameCheckResult.CLOSE_MATCH);
    expect(saved.nameCheckSuggestion).toBe('Ada Lovelace');
  });

  it('opens the cooling-off window exactly 24 hours out', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const saved = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId),
    });

    expect(saved.trustedFrom.getTime()).toBe(
      rig.clock.timestamp() + COOLING_OFF_HOURS * ONE_HOUR_MS,
    );
  });

  it('returns the incumbent rather than restarting the clock on a duplicate save', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const first = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId),
    });

    rig.clock.advance(ONE_HOUR_MS);

    const second = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId, 'Ada again'),
    });

    expect(second.id).toBe(first.id);
    expect(second.trustedFrom).toEqual(first.trustedFrom);
    expect(await rig.beneficiaries.list(TEST_USER)).toHaveLength(1);
  });
});

describe('the payee address book', () => {
  it('answers BENEFICIARY_NOT_FOUND for another customer’s payee', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);
    const saved = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId),
    });

    await expect(rig.beneficiaries.get(OTHER_USER, saved.id)).rejects.toMatchObject({
      code: ErrorCode.BENEFICIARY_NOT_FOUND,
    });
  });

  it('renames and favourites, but never lets the destination move', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);
    const saved = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId),
    });

    const updated = await rig.beneficiaries.update(TEST_USER, saved.id, {
      nickname: 'Ada',
      isFavourite: true,
    });

    expect(updated.nickname).toBe('Ada');
    expect(updated.isFavourite).toBe(true);
    expect(updated.destination).toEqual(saved.destination);
  });

  it('lists favourites first', async () => {
    const rig = beneficiariesRig();
    const first = await payeeAccount(rig);
    const second = await seedAccount(rig.accounts, {
      userId: OTHER_USER,
      holderIds: [OTHER_USER],
    });

    const plain = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(first, 'Plain'),
    });
    const starred = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: { ...internalRequest(second, 'Starred'), isFavourite: true },
    });

    const listed = await rig.beneficiaries.list(TEST_USER);
    expect(listed.map((payee) => payee.id)).toEqual([starred.id, plain.id]);
    expect(await rig.beneficiaries.list(TEST_USER, true)).toHaveLength(1);
  });

  it('forgets a payee, and refuses to forget one twice', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);
    const saved = await rig.beneficiaries.create({
      userId: TEST_USER,
      request: internalRequest(accountId),
    });

    await rig.beneficiaries.remove(TEST_USER, saved.id);
    await expect(rig.beneficiaries.remove(TEST_USER, saved.id)).rejects.toMatchObject({
      code: ErrorCode.BENEFICIARY_NOT_FOUND,
    });
  });
});

describe('resolving a destination', () => {
  it('finds the account behind an email', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const resolved = await rig.payees.require({
      destination: { kind: 'INTERNAL', email: 'ada@example.com' },
      payerUserId: TEST_USER,
    });

    expect(resolved.account.id).toBe(accountId);
    expect(resolved.holderName).toBe('Ada Lovelace');
    expect(resolved.ownAccount).toBe(false);
  });

  it('finds the account behind a handle', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const resolved = await rig.payees.require({
      destination: { kind: 'INTERNAL', handle: '@ada' },
      payerUserId: TEST_USER,
    });

    expect(resolved.account.id).toBe(accountId);
  });

  it('finds the account behind an account number', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);
    const account = await rig.accounts.findById(accountId);

    const resolved = await rig.payees.require({
      destination: { kind: 'INTERNAL', accountNumber: account?.number ?? '' },
      payerUserId: TEST_USER,
    });

    expect(resolved.account.id).toBe(accountId);
  });

  it('reports the payer’s own account as their own', async () => {
    const rig = beneficiariesRig();
    const own = await seedAccount(rig.accounts, { ledger: gbp('100') });

    const resolved = await rig.payees.require({
      destination: { kind: 'INTERNAL', accountId: own },
      payerUserId: TEST_USER,
    });

    expect(resolved.ownAccount).toBe(true);
  });

  it('hides a closed account behind the same answer as a missing one', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);
    await rig.accounts.patch({ accountId, fields: { status: AccountStatus.CLOSED } });

    await expect(
      rig.payees.require({
        destination: { kind: 'INTERNAL', accountId },
        payerUserId: TEST_USER,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BENEFICIARY_NOT_FOUND });
  });

  it('refuses a destination that names the payee two ways', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    await expect(
      rig.payees.resolve({
        destination: { kind: 'INTERNAL', accountId, email: 'ada@example.com' },
        payerUserId: TEST_USER,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('answers null for a destination on another rail', async () => {
    const rig = beneficiariesRig();

    const resolved = await rig.payees.resolve({
      destination: {
        kind: 'DOMESTIC',
        accountName: 'Ada Lovelace',
        accountNumber: '1234567890',
        sortCode: '049921',
      },
      payerUserId: TEST_USER,
    });

    expect(resolved).toBeNull();
  });
});

describe('the cooling-off gate', () => {
  it('refuses a large payment to a payee nobody has saved', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);

    const standing = await rig.trust.assess({
      userId: TEST_USER,
      destination: { kind: 'INTERNAL', accountId },
      ownAccount: false,
      amount: Money.fromMajor('5000', 'GBP'),
      resolved: { accountId, accountNumber: '1234567890' },
    });

    expect(standing.trust).toBe(PayeeTrust.UNKNOWN);
    expect(standing.requiresStepUp).toBe(true);
    expect(() => rig.trust.assertPayable(standing, Money.fromMajor('5000', 'GBP'))).toThrow(
      expect.objectContaining({ code: ErrorCode.BENEFICIARY_COOLING_OFF }),
    );
  });

  it('allows the same payee once the window has passed', async () => {
    const rig = beneficiariesRig();
    const accountId = await payeeAccount(rig);
    await rig.beneficiaries.create({ userId: TEST_USER, request: internalRequest(accountId) });

    rig.clock.advance((COOLING_OFF_HOURS + 1) * ONE_HOUR_MS);

    const standing = await rig.trust.assess({
      userId: TEST_USER,
      destination: { kind: 'INTERNAL', accountId },
      ownAccount: false,
      amount: Money.fromMajor('5000', 'GBP'),
      resolved: { accountId, accountNumber: '1234567890' },
    });

    expect(standing.trust).toBe(PayeeTrust.TRUSTED);
    expect(() => rig.trust.assertPayable(standing, Money.fromMajor('5000', 'GBP'))).not.toThrow();
  });
});

describe('destination keys', () => {
  it('keys each rail in its own namespace', () => {
    expect(primaryDestinationKey({ kind: 'INTERNAL', accountNumber: '1234567890' })).toBe(
      'internal:num:1234567890',
    );
    expect(
      primaryDestinationKey({
        kind: 'DOMESTIC',
        accountName: 'Ada',
        accountNumber: '1234567890',
        sortCode: '049921',
      }),
    ).toBe('domestic:049921:1234567890');
  });

  it('lower-cases so an email cannot be saved twice in two casings', () => {
    expect(destinationKeys({ kind: 'INTERNAL', email: 'Ada@Example.com' })).toEqual([
      'internal:email:ada@example.com',
    ]);
  });

  it('refuses to key a destination that names nobody', () => {
    expect(() => primaryDestinationKey({ kind: 'INTERNAL' })).toThrow(RangeError);
  });
});
