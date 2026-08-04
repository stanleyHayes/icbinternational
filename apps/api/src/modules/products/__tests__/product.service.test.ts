import { AccountType, ErrorCode, type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { ProductService } from '../product.service.js';

import { FakeProductRepository } from './product-repository.fake.js';

const TODAY = new Date('2026-08-02T09:00:00.000Z');

function build(): { service: ProductService; repository: FakeProductRepository } {
  const repository = new FakeProductRepository();
  const clock = new ClockService();
  clock.freezeAt(TODAY);

  return {
    repository,
    service: new ProductService(repository.asRepository(), clock, new IdGenerator()),
  };
}

/** A version of the seeded current account with the fields a test cares about overridden. */
function version(overrides: Partial<Product>): Product {
  return { ...EVERYDAY_CURRENT, ...overrides };
}

describe('findActive', () => {
  it('returns the version in force on the requested date, not the newest one', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ version: 1, effectiveFrom: '2024-01-01', monthlyFee: money('0') }))
      .seed(version({ version: 2, effectiveFrom: '2026-01-01', monthlyFee: money('500') }));

    const asSold = await service.findActive('EVERYDAY_CURRENT', '2025-06-30');

    expect(asSold?.version).toBe(1);
    expect(asSold?.monthlyFee.amount).toBe('0');
  });

  it('returns the newest version once its effective date has arrived', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ version: 1, effectiveFrom: '2024-01-01' }))
      .seed(version({ version: 2, effectiveFrom: '2026-01-01' }));

    await expect(service.findActive('EVERYDAY_CURRENT')).resolves.toMatchObject({ version: 2 });
  });

  it('returns nothing for a date before the product existed', async () => {
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01' }));

    await expect(service.findActive('EVERYDAY_CURRENT', '2023-12-31')).resolves.toBeNull();
  });

  it('still prices an account on a withdrawn product', async () => {
    // `active: false` closes the product to new applications. The customers already on it
    // have to be charged something, and it has to be the terms they were sold.
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01', active: false }));

    await expect(service.findActive('EVERYDAY_CURRENT')).resolves.toMatchObject({ version: 1 });
  });

  it('stops resolving a version once its explicit end date has passed', async () => {
    const { service, repository } = build();
    repository.seed(
      version({ version: 1, effectiveFrom: '2024-01-01', effectiveTo: '2026-01-01' }),
    );

    await expect(service.findActive('EVERYDAY_CURRENT', '2025-12-31')).resolves.not.toBeNull();
    await expect(service.findActive('EVERYDAY_CURRENT', '2026-01-01')).resolves.toBeNull();
  });

  it('breaks a same-day tie in favour of the higher version', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ version: 1, effectiveFrom: '2026-01-01' }))
      .seed(version({ version: 2, effectiveFrom: '2026-01-01' }));

    await expect(service.findActive('EVERYDAY_CURRENT')).resolves.toMatchObject({ version: 2 });
  });
});

describe('requireActive', () => {
  it('throws NOT_FOUND rather than returning null', async () => {
    const { service } = build();

    await expect(service.requireActive('NO_SUCH_PRODUCT')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('listCatalogue', () => {
  it('returns one version per code, and only the ones open to applications', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ code: 'A', version: 1, effectiveFrom: '2024-01-01' }))
      .seed(version({ code: 'A', version: 2, effectiveFrom: '2026-01-01' }))
      .seed(version({ code: 'B', version: 1, effectiveFrom: '2024-01-01', active: false }))
      .seed(version({ code: 'C', version: 1, effectiveFrom: '2024-01-01' }));

    const catalogue = await service.listCatalogue();

    expect(catalogue.map((product) => `${product.code}v${product.version}`)).toEqual([
      'Av2',
      'Cv1',
    ]);
  });

  it('shows the catalogue as it stood on a past date', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ code: 'A', version: 1, effectiveFrom: '2024-01-01' }))
      .seed(version({ code: 'B', version: 1, effectiveFrom: '2026-05-01' }));

    await expect(service.listCatalogue('2025-01-01')).resolves.toHaveLength(1);
  });
});

describe('publishVersion', () => {
  it('assigns the next version number and never touches the previous one', async () => {
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01', monthlyFee: money('0') }));
    const before = { ...repository.all[0] };

    const published = await service.publishVersion(
      version({ effectiveFrom: '2026-09-01', monthlyFee: money('500') }),
    );

    expect(published.version).toBe(2);
    expect(repository.all[0]).toEqual(before);
  });

  it('starts a brand new product at version 1', async () => {
    const { service } = build();

    const published = await service.publishVersion(version({ code: 'NEW_PRODUCT' }));

    expect(published.version).toBe(1);
  });

  it('refuses a version backdated before the one it supersedes', async () => {
    // Backdating would silently change the answer to "what were the terms last month?"
    // for every account and every statement already issued.
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2026-01-01' }));

    await expect(
      service.publishVersion(version({ effectiveFrom: '2025-06-01' })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('allows a correction published the same day', async () => {
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2026-01-01' }));

    await expect(
      service.publishVersion(version({ effectiveFrom: '2026-01-01' })),
    ).resolves.toMatchObject({ version: 2 });
  });

  it('gives every version its own prefixed identifier', async () => {
    const { service, repository } = build();

    await service.publishVersion(version({ effectiveFrom: '2026-09-01' }));

    expect(repository.all[0]?.id).toMatch(/^prd_[\dA-HJKMNP-TV-Z]{26}$/);
  });
});

describe('ensureVersion', () => {
  it('inserts a version that is not there', async () => {
    const { service, repository } = build();

    await expect(service.ensureVersion(EVERYDAY_CURRENT)).resolves.toBe(true);
    expect(repository.all).toHaveLength(1);
  });

  it('leaves an existing version alone, even if the definition has changed', async () => {
    const { service, repository } = build();
    repository.seed(EVERYDAY_CURRENT);

    const changed = version({ monthlyFee: money('999'), accountType: AccountType.SAVINGS });

    await expect(service.ensureVersion(changed)).resolves.toBe(false);
    expect(repository.all).toHaveLength(1);
    expect(repository.all[0]?.monthlyFee.amount).toBe('0');
  });
});

describe('listVersions', () => {
  it('returns every version oldest first', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ version: 2, effectiveFrom: '2026-01-01' }))
      .seed(version({ version: 1, effectiveFrom: '2024-01-01' }));

    const versions = await service.listVersions('EVERYDAY_CURRENT');

    expect(versions.map((product) => product.version)).toEqual([1, 2]);
  });

  it('throws for a code that was never published', async () => {
    const { service } = build();

    await expect(service.listVersions('NO_SUCH_PRODUCT')).rejects.toBeInstanceOf(AppError);
  });
});

describe('getVersion', () => {
  it('returns the pinned version’s terms after newer versions have been published', async () => {
    // The account-opening guarantee: an account stores (code, version) and reads those
    // terms forever. Publishing v2 and v3 must not change what v1 says.
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01', monthlyFee: money('0') }));
    await service.publishVersion(
      version({ effectiveFrom: '2026-01-01', monthlyFee: money('500') }),
    );
    await service.publishVersion(
      version({ effectiveFrom: '2026-08-01', monthlyFee: money('700') }),
    );

    const pinned = await service.getVersion('EVERYDAY_CURRENT', 1);

    expect(pinned.version).toBe(1);
    expect(pinned.monthlyFee.amount).toBe('0');
  });

  it('reads a pinned version regardless of dates or status', async () => {
    const { service, repository } = build();
    repository.seed(
      version({
        version: 1,
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-12-31',
        active: false,
      }),
    );

    await expect(service.getVersion('EVERYDAY_CURRENT', 1)).resolves.toMatchObject({
      version: 1,
    });
  });

  it('throws NOT_FOUND for a version that was never published', async () => {
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01' }));

    await expect(service.getVersion('EVERYDAY_CURRENT', 9)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('listLatestPerCode', () => {
  it('returns the newest version of every code, including withdrawn ones', async () => {
    const { service, repository } = build();
    repository
      .seed(version({ code: 'A', version: 1, effectiveFrom: '2024-01-01' }))
      .seed(version({ code: 'A', version: 2, effectiveFrom: '2026-01-01' }))
      .seed(version({ code: 'B', version: 1, effectiveFrom: '2024-01-01', active: false }));

    const latest = await service.listLatestPerCode();

    expect(latest.map((product) => `${product.code}v${product.version}`)).toEqual(['Av2', 'Bv1']);
  });
});

describe('checkEligibility', () => {
  it('evaluates the rules against the version in force today', async () => {
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01', minKycTier: 2 }));

    const verdict = await service.checkEligibility('EVERYDAY_CURRENT', {
      kycTier: 1,
      openingBalance: Money.fromMinor('10000', 'GBP'),
    });

    expect(verdict.eligible).toBe(false);
    expect(verdict.denials.map((denial) => denial.code)).toEqual([ErrorCode.KYC_TIER_TOO_LOW]);
  });

  it('approves an applicant who meets the rules', async () => {
    const { service, repository } = build();
    repository.seed(version({ version: 1, effectiveFrom: '2024-01-01', minKycTier: 1 }));

    const verdict = await service.checkEligibility('EVERYDAY_CURRENT', {
      kycTier: 1,
      openingBalance: Money.fromMinor('10000', 'GBP'),
    });

    expect(verdict.eligible).toBe(true);
  });

  it('throws NOT_FOUND for a code that was never published', async () => {
    const { service } = build();

    await expect(
      service.checkEligibility('NO_SUCH_PRODUCT', {
        kycTier: 3,
        openingBalance: Money.fromMinor('10000', 'GBP'),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

function money(minorUnits: string) {
  return { amount: minorUnits, currency: 'GBP' } as const;
}
