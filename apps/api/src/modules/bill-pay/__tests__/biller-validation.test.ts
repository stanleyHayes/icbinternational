import { ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { escapeRegex } from '../biller-directory.repository.js';
import { BillerDirectoryService } from '../biller-directory.service.js';
import {
  assertAmountAccepted,
  assertBillerActive,
  assertReferenceMatches,
} from '../biller-validation.js';
import { InMemoryBillerDirectoryStore } from '../in-memory-biller-directory.store.js';
import { providerSlug } from '../top-up.service.js';

import { billerFixture, ScriptedBillerRail } from './bill-pay-harness.js';

function codeOf(work: () => void): string {
  try {
    work();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }

  return 'NO_ERROR_THROWN';
}

describe('validating a reference against the biller format', () => {
  const biller = billerFixture();

  it('accepts the shape the biller actually uses', () => {
    expect(() => {
      assertReferenceMatches(biller, '1234567890');
    }).not.toThrow();
  });

  it('trims before it judges, because people paste with spaces', () => {
    expect(() => {
      assertReferenceMatches(biller, '  1234567890  ');
    }).not.toThrow();
  });

  it('rejects a reference of the wrong length', () => {
    expect(
      codeOf(() => {
        assertReferenceMatches(biller, '12345');
      }),
    ).toBe(ErrorCode.INVALID_ACCOUNT_NUMBER);
  });

  it('rejects an empty reference', () => {
    expect(
      codeOf(() => {
        assertReferenceMatches(biller, '   ');
      }),
    ).toBe(ErrorCode.INVALID_ACCOUNT_NUMBER);
  });

  it('rejects an absurdly long reference before compiling anything against it', () => {
    expect(
      codeOf(() => {
        assertReferenceMatches(biller, '1'.repeat(5000));
      }),
    ).toBe(ErrorCode.INVALID_ACCOUNT_NUMBER);
  });

  it('names the label the biller uses, so the customer knows which box to look in', () => {
    try {
      assertReferenceMatches(biller, 'nope');
    } catch (error) {
      expect((error as AppError).message).toContain('customer reference');
    }
  });
});

describe('validating an amount against the biller limits', () => {
  const biller = billerFixture();

  it('accepts an amount inside the range', () => {
    expect(() => {
      assertAmountAccepted(biller, Money.fromMajor('42.50', 'GBP'));
    }).not.toThrow();
  });

  it('refuses below the minimum', () => {
    expect(
      codeOf(() => {
        assertAmountAccepted(biller, Money.fromMinor(50n, 'GBP'));
      }),
    ).toBe(ErrorCode.AMOUNT_BELOW_MINIMUM);
  });

  it('refuses above the maximum', () => {
    expect(
      codeOf(() => {
        assertAmountAccepted(biller, Money.fromMajor('9,000.00', 'GBP'));
      }),
    ).toBe(ErrorCode.AMOUNT_ABOVE_MAXIMUM);
  });

  it('refuses the wrong currency outright rather than converting behind the scenes', () => {
    expect(
      codeOf(() => {
        assertAmountAccepted(biller, Money.fromMajor('42.50', 'EUR'));
      }),
    ).toBe(ErrorCode.CURRENCY_MISMATCH);
  });

  it('refuses a biller the bank has withdrawn', () => {
    expect(
      codeOf(() => {
        assertBillerActive(billerFixture({ active: false }));
      }),
    ).toBe(ErrorCode.PRECONDITION_FAILED);
  });
});

describe('the biller directory', () => {
  const directory = new InMemoryBillerDirectoryStore([
    billerFixture(),
    billerFixture({ id: 'british-gas', name: 'British Gas', category: 'GAS' }),
    billerFixture({ id: 'retired', name: 'Retired Biller', active: false }),
  ]);

  const service = new BillerDirectoryService(directory, new ScriptedBillerRail());

  it('lists only the billers the bank can still pay', async () => {
    const page = await service.list({ limit: 25 });

    expect(page.data).toHaveLength(2);
    expect(page.data.map((biller) => biller.id)).not.toContain('retired');
  });

  it('narrows by category', async () => {
    const page = await service.list({ limit: 25, category: 'GAS' });
    expect(page.data.map((biller) => biller.id)).toStrictEqual(['british-gas']);
  });

  it('searches by name, case-insensitively', async () => {
    const page = await service.list({ limit: 25, search: 'thames' });
    expect(page.data.map((biller) => biller.id)).toStrictEqual(['thames-water']);
  });

  it('hands back a cursor when there is more to read, and none when there is not', async () => {
    const first = await service.list({ limit: 1 });
    expect(first.page.hasMore).toBe(true);

    const second = await service.list({ limit: 1, cursor: first.page.cursor ?? undefined });
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
    expect(second.page.hasMore).toBe(false);
  });

  it('refuses an unknown biller rather than returning nothing', async () => {
    await expect(service.require('no-such-biller')).rejects.toBeInstanceOf(AppError);
  });

  it('neutralises a search term that would otherwise be a regular expression', () => {
    expect(escapeRegex('.*')).toBe(String.raw`\.\*`);
    expect(escapeRegex('British Gas')).toBe('British Gas');
  });
});

describe('provider slugs', () => {
  it('turns a provider name into something searchable and stable', () => {
    expect(providerSlug('EE')).toBe('ee');
    expect(providerSlug('  Virgin Mobile  ')).toBe('virgin-mobile');
    expect(providerSlug('O2 (UK)')).toBe('o2-uk');
  });
});
