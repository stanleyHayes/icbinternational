import { ErrorCode } from '@reliance/contracts';

import { type AppError } from '../../../common/errors/app-error.js';
import { serialOf } from '../account-number.service.js';
import { hasValidDomesticCheck, isValidIban } from '../iban.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';

import { numberServiceFor, seedAccount, TEST_BANK } from './accounts-harness.js';

describe('AccountNumberService', () => {
  it('mints a ten-digit number whose domestic check digits validate', () => {
    const service = numberServiceFor(new InMemoryAccountStore());

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const identifiers = service.mint();

      expect(identifiers.number).toMatch(/^\d{10}$/);
      expect(hasValidDomesticCheck(identifiers.number)).toBe(true);
    }
  });

  it('mints an IBAN that passes the mod-97 check every time', () => {
    const service = numberServiceFor(new InMemoryAccountStore());

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const { iban } = service.mint();

      expect(iban).toMatch(/^GB\d{2}RLNC\d{14}$/);
      expect(isValidIban(iban)).toBe(true);
    }
  });

  it('carries the same serial in the number and the IBAN', () => {
    const identifiers = numberServiceFor(new InMemoryAccountStore()).identifiersFor('04871123');

    expect(identifiers.number.startsWith('04871123')).toBe(true);
    expect(identifiers.iban).toContain('04871123');
    expect(serialOf(identifiers.number)).toBe('04871123');
  });

  it('is deterministic for a given serial, so a fixture reproduces exactly', () => {
    const service = numberServiceFor(new InMemoryAccountStore());

    expect(service.identifiersFor('00000042')).toEqual(service.identifiersFor('00000042'));
  });

  it('embeds the bank identity it was configured with', () => {
    const { iban, sortCode } = numberServiceFor(new InMemoryAccountStore()).identifiersFor(
      '04871123',
    );

    expect(sortCode).toBe(TEST_BANK.sortCode);
    expect(iban.slice(0, 2)).toBe(TEST_BANK.countryCode);
    expect(iban.slice(4, 8)).toBe(TEST_BANK.bankCode);
    expect(iban.slice(8, 14)).toBe(TEST_BANK.sortCode);
  });

  it('skips a number that is already taken', async () => {
    const accounts = new InMemoryAccountStore();
    const service = numberServiceFor(accounts);

    const taken = service.identifiersFor('04871123');
    await seedAccount(accounts, { number: taken.number, iban: taken.iban });

    // Force the first candidate to collide, then let the real generator take over.
    const mint = jest.spyOn(service, 'mint');
    mint.mockReturnValueOnce(taken);

    const allocated = await service.allocate();
    expect(allocated.number).not.toBe(taken.number);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('gives up rather than looping forever when every candidate collides', async () => {
    const accounts = new InMemoryAccountStore();
    const service = numberServiceFor(accounts);

    const taken = service.identifiersFor('04871123');
    await seedAccount(accounts, { number: taken.number, iban: taken.iban });
    jest.spyOn(service, 'mint').mockReturnValue(taken);

    await expect(service.allocate()).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    } satisfies Partial<AppError>);
  });
});
