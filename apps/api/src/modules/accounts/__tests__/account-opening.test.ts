import { AccountStatus, AccountType, ErrorCode, type Product } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type UsersService, type UserRepository } from '../../auth/users/index.js';
import { type ProductService } from '../../products/index.js';
import { AccountEligibilityService } from '../account-eligibility.service.js';
import { AccountOpeningService } from '../account-opening.service.js';
import { MAX_OPEN_ACCOUNTS_PER_CUSTOMER } from '../account.constants.js';
import { AccountFactory } from '../account.factory.js';
import { isValidIban } from '../iban.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';

import {
  frozenClock,
  numberServiceFor,
  productFixture,
  retryingRunner,
  seedAccount,
  OTHER_USER,
  TEST_USER,
  rejectionFrom,
} from './accounts-harness.js';

const PARTNER_EMAIL = 'partner@example.com';

interface Rig {
  accounts: InMemoryAccountStore;
  opening: AccountOpeningService;
}

function rigFor(input: {
  product: Product;
  kycTier?: number;
  holders?: Record<string, string>;
}): Rig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();

  const products = {
    requireActive: async (code: string) => {
      if (code !== input.product.code) throw AppError.notFound('Product', code);
      return input.product;
    },
  } as unknown as ProductService;

  const users = {
    requireById: async (id: string) => ({ id, kycTier: input.kycTier ?? 3, baseCurrency: 'GBP' }),
  } as unknown as UsersService;

  const userRecords = {
    findByEmail: async (email: string) => {
      const id = (input.holders ?? {})[email];
      return id ? { id } : null;
    },
  } as unknown as UserRepository;

  return {
    accounts,
    opening: new AccountOpeningService(
      accounts,
      new AccountEligibilityService(products, users, userRecords),
      new AccountFactory(numberServiceFor(accounts), new IdGenerator(), clock),
      retryingRunner(),
    ),
  };
}

function request(
  overrides: Partial<{
    productCode: string;
    currency: 'GBP' | 'USD';
    nickname: string;
    additionalHolderEmails: string[];
  }> = {},
) {
  return {
    productCode: 'EVERYDAY_CURRENT',
    currency: 'GBP' as const,
    additionalHolderEmails: [],
    ...overrides,
  };
}

describe('opening an account', () => {
  it('opens an active account with valid identifiers when nothing is owed up front', async () => {
    const { opening } = rigFor({ product: productFixture() });

    const account = await opening.open({ userId: TEST_USER, request: request() });

    expect(account.status).toBe(AccountStatus.ACTIVE);
    expect(account.type).toBe(AccountType.CURRENT);
    expect(account.number).toMatch(/^\d{10}$/);
    expect(isValidIban(account.iban)).toBe(true);
    expect(account.balance.ledger.amount).toBe('0');
    expect(account.productCode).toBe('EVERYDAY_CURRENT');
    expect(account.productName).toBe('Everyday Current');
  });

  it('pins the product version, so later repricing cannot reach the account', async () => {
    const { accounts, opening } = rigFor({ product: productFixture({ version: 7 }) });

    const account = await opening.open({ userId: TEST_USER, request: request() });
    const stored = await accounts.findById(account.id);

    expect(stored?.productVersion).toBe(7);
  });

  it('refuses an applicant whose verification tier is too low', async () => {
    const { opening } = rigFor({ product: productFixture({ minKycTier: 3 }), kycTier: 1 });

    await expect(opening.open({ userId: TEST_USER, request: request() })).rejects.toMatchObject({
      code: ErrorCode.KYC_TIER_TOO_LOW,
    });
  });

  it('refuses a product that is no longer open to new applications', async () => {
    const { opening } = rigFor({ product: productFixture({ active: false }) });

    await expect(opening.open({ userId: TEST_USER, request: request() })).rejects.toMatchObject({
      code: ErrorCode.PRECONDITION_FAILED,
    });
  });

  it('refuses a currency the product is not sold in', async () => {
    const { opening } = rigFor({ product: productFixture({ currencies: ['GBP'] }) });

    await expect(
      opening.open({ userId: TEST_USER, request: request({ currency: 'USD' }) }),
    ).rejects.toMatchObject({ code: ErrorCode.CURRENCY_MISMATCH });
  });

  it('reports every failed rule at once rather than one at a time', async () => {
    const { opening } = rigFor({
      product: productFixture({ active: false, minKycTier: 3, currencies: ['GBP'] }),
      kycTier: 0,
    });

    const error = await rejectionFrom(opening.open({ userId: TEST_USER, request: request() }));

    expect(error.details).toHaveLength(2);
  });

  /**
   * The minimum opening balance is the one rule that must not refuse the application:
   * there is nowhere to send the deposit until the account exists.
   */
  it('opens pending — not refused — when the product demands an opening deposit', async () => {
    const { accounts, opening } = rigFor({
      product: productFixture({ minOpeningBalance: { amount: '10000', currency: 'GBP' } }),
    });

    const account = await opening.open({ userId: TEST_USER, request: request() });
    const stored = await accounts.findById(account.id);

    expect(account.status).toBe(AccountStatus.PENDING);
    expect(stored?.minimumOpeningBalance.amount).toBe('10000');
  });

  it('turns a current account into a joint one when another holder is named', async () => {
    const { opening } = rigFor({
      product: productFixture(),
      holders: { [PARTNER_EMAIL]: OTHER_USER },
    });

    const account = await opening.open({
      userId: TEST_USER,
      request: request({ additionalHolderEmails: [PARTNER_EMAIL] }),
    });

    expect(account.type).toBe(AccountType.JOINT);
    expect(account.holderIds).toEqual([TEST_USER, OTHER_USER]);
  });

  it('refuses a holder who is not a customer, naming the offending field', async () => {
    const { opening } = rigFor({ product: productFixture() });

    const error = await rejectionFrom(
      opening.open({
        userId: TEST_USER,
        request: request({ additionalHolderEmails: ['stranger@example.com'] }),
      }),
    );

    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.details?.[0]?.path).toBe('additionalHolderEmails.0');
  });

  it('refuses a second holder on a product that cannot be held jointly', async () => {
    const { opening } = rigFor({
      product: productFixture({ accountType: AccountType.SAVINGS }),
      holders: { [PARTNER_EMAIL]: OTHER_USER },
    });

    await expect(
      opening.open({
        userId: TEST_USER,
        request: request({ additionalHolderEmails: [PARTNER_EMAIL] }),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PRECONDITION_FAILED });
  });

  it('makes the first account in a currency primary and later ones not', async () => {
    const { opening } = rigFor({ product: productFixture() });

    const first = await opening.open({ userId: TEST_USER, request: request() });
    const second = await opening.open({ userId: TEST_USER, request: request() });

    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
  });

  it('mints a distinct number and IBAN for every account', async () => {
    const { opening } = rigFor({ product: productFixture() });

    const opened = [];
    for (let index = 0; index < 15; index += 1) {
      opened.push(await opening.open({ userId: TEST_USER, request: request() }));
    }

    expect(new Set(opened.map((account) => account.number)).size).toBe(opened.length);
    expect(new Set(opened.map((account) => account.iban)).size).toBe(opened.length);
  });

  it('refuses once the customer has hit the portfolio cap', async () => {
    const { accounts, opening } = rigFor({ product: productFixture() });

    for (let index = 0; index < MAX_OPEN_ACCOUNTS_PER_CUSTOMER; index += 1) {
      await seedAccount(accounts, { isPrimary: false });
    }

    await expect(opening.open({ userId: TEST_USER, request: request() })).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_LIMIT_REACHED,
    });
  });

  it('counts closed accounts as freed slots', async () => {
    const { accounts, opening } = rigFor({ product: productFixture() });

    for (let index = 0; index < MAX_OPEN_ACCOUNTS_PER_CUSTOMER; index += 1) {
      await seedAccount(accounts, { isPrimary: false, status: AccountStatus.CLOSED });
    }

    await expect(opening.open({ userId: TEST_USER, request: request() })).resolves.toMatchObject({
      status: AccountStatus.ACTIVE,
    });
  });
});
