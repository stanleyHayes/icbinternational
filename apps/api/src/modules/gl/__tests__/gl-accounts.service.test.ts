import { ErrorCode, LedgerAccountType } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type AppConfigService } from '../../../config/config.service.js';
import { GL } from '../../../domain/ledger/chart-of-accounts.js';
import { GlAccountsService } from '../gl-accounts.service.js';
import { type GlTotalsRepository } from '../gl-totals.repository.js';
import { type LedgerAccountRepository } from '../ledger-account.repository.js';
import { type GlChartAccountDocument } from '../schemas/ledger-account.schema.js';

const CONFIG = {
  bank: { baseCurrency: 'GBP', currencies: ['GBP'] },
} as unknown as AppConfigService;

function doc(
  code: string,
  type: LedgerAccountType = LedgerAccountType.EXPENSE,
): GlChartAccountDocument {
  return {
    id: `gla_${code}`,
    code,
    name: `Account ${code}`,
    type,
    isControlAccount: false,
    active: true,
  } as unknown as GlChartAccountDocument;
}

function build(overrides: {
  findByCode?: LedgerAccountRepository['findByCode'];
  insertUnique?: LedgerAccountRepository['insertUnique'];
  totals?: GlTotalsRepository['totalsByAccount'];
}): { service: GlAccountsService; patched: jest.Mock } {
  const patched = jest.fn((code: string) =>
    overrides.findByCode ? overrides.findByCode(code) : Promise.resolve(doc(code)),
  );
  const accounts = {
    findByCode: overrides.findByCode ?? (() => Promise.resolve(null)),
    insertUnique: overrides.insertUnique,
    patchByCode: patched,
    listAll: () => Promise.resolve([]),
    listActive: () => Promise.resolve([]),
  } as unknown as LedgerAccountRepository;

  const totals = {
    totalsByAccount: overrides.totals ?? (() => Promise.resolve([])),
  } as unknown as GlTotalsRepository;

  return {
    service: new GlAccountsService(accounts, totals, new IdGenerator(), CONFIG),
    patched,
  };
}

async function expectAppError(work: () => Promise<unknown>, code: ErrorCode): Promise<void> {
  let thrown: unknown;
  try {
    await work();
  } catch (error) {
    thrown = error;
  }

  // Asserting outside the catch so a call that wrongly succeeds fails the test rather
  // than skipping the assertions altogether.
  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe(code);
}

describe('GlAccountsService.createAccount', () => {
  it('creates a manual account with a zero base-currency balance', async () => {
    const created = doc('6000');
    const { service } = build({
      insertUnique: () => Promise.resolve({ account: created }),
    });

    const account = await service.createAccount({
      code: '6000',
      name: 'Software Costs',
      type: LedgerAccountType.EXPENSE,
    });

    expect(account.code).toBe('6000');
    expect(account.balance).toEqual({ amount: '0', currency: 'GBP' });
  });

  it('reports a duplicate code as CONFLICT', async () => {
    const { service } = build({ insertUnique: () => Promise.resolve({ conflict: true }) });

    await expectAppError(
      () =>
        service.createAccount({
          code: GL.SUSPENSE,
          name: 'Duplicate',
          type: LedgerAccountType.LIABILITY,
        }),
      ErrorCode.CONFLICT,
    );
  });
});

describe('GlAccountsService.renameAccount', () => {
  it('renames a manually-created account', async () => {
    const renamed = { ...doc('6000'), name: 'Renamed' } as unknown as GlChartAccountDocument;
    const { service, patched } = build({
      findByCode: () => Promise.resolve(renamed),
    });

    const account = await service.renameAccount('6000', 'Renamed');
    expect(patched).toHaveBeenCalledWith('6000', { name: 'Renamed' });
    expect(account.name).toBe('Renamed');
  });

  it('refuses to rename a static-chart account', async () => {
    const { service } = build({
      findByCode: () => Promise.resolve(doc(GL.CUSTOMER_DEPOSITS, LedgerAccountType.LIABILITY)),
    });

    await expectAppError(
      () => service.renameAccount(GL.CUSTOMER_DEPOSITS, 'Deposits'),
      ErrorCode.PRECONDITION_FAILED,
    );
  });

  it('answers NOT_FOUND for an unknown code', async () => {
    const { service } = build({});
    await expectAppError(() => service.renameAccount('9999', 'Nope'), ErrorCode.NOT_FOUND);
  });
});

describe('GlAccountsService.deactivateAccount', () => {
  it('retires a zero-balance manual account', async () => {
    const existing = doc('6000');
    const { service, patched } = build({
      findByCode: () => Promise.resolve(existing),
    });

    await service.deactivateAccount('6000');
    expect(patched).toHaveBeenCalledWith('6000', { active: false });
  });

  it('refuses to retire an account carrying a balance', async () => {
    const existing = doc('6000');
    const { service } = build({
      findByCode: () => Promise.resolve(existing),
      totals: () => Promise.resolve([{ code: '6000', debits: '100', credits: '0' }]),
    });

    await expectAppError(() => service.deactivateAccount('6000'), ErrorCode.PRECONDITION_FAILED);
  });

  it('refuses to retire a static-chart account', async () => {
    const { service } = build({
      findByCode: () => Promise.resolve(doc(GL.FEE_INCOME, LedgerAccountType.INCOME)),
    });

    await expectAppError(
      () => service.deactivateAccount(GL.FEE_INCOME),
      ErrorCode.PRECONDITION_FAILED,
    );
  });
});

describe('GlAccountsService.getAccount', () => {
  it('reports a credit-positive balance for a liability', async () => {
    const existing = doc(GL.CUSTOMER_DEPOSITS, LedgerAccountType.LIABILITY);
    const { service } = build({
      findByCode: () => Promise.resolve(existing),
      totals: () =>
        Promise.resolve([{ code: GL.CUSTOMER_DEPOSITS, debits: '200', credits: '1000' }]),
    });

    const account = await service.getAccount(GL.CUSTOMER_DEPOSITS);
    expect(account.balance).toEqual({ amount: '800', currency: 'GBP' });
  });

  it('answers NOT_FOUND for an unknown code', async () => {
    const { service } = build({});
    await expectAppError(() => service.getAccount('9999'), ErrorCode.NOT_FOUND);
  });
});
