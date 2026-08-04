import { Injectable } from '@nestjs/common';

import { CURRENCY_CODES, getCurrency } from '@reliance/money';

import { AppConfigService } from '../../config/config.service.js';
import { SeedWriter, type SeedDocument } from '../seed-writer.js';
import { CURRENCIES_COLLECTION } from '../seed.constants.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

/**
 * Seeds the currency reference table.
 *
 * The table is derived from `@reliance/money` rather than typed out again, so there is
 * exactly one place where "JPY has no minor units" is stated. What the database adds is
 * operational state the value object has no business knowing: which currencies this
 * deployment actually trades, and which one the books are kept in.
 *
 * `enabled` is recomputed from configuration on every run, so turning a currency on in
 * `SUPPORTED_CURRENCIES` and re-seeding is the supported way to enable it.
 */
@Injectable()
export class CurrenciesSeeder implements Seeder {
  readonly name = 'currencies';

  constructor(
    private readonly writer: SeedWriter,
    private readonly config: AppConfigService,
  ) {}

  async run(): Promise<SeedOutcome> {
    const enabled = new Set<string>(this.config.bank.currencies);
    const base = this.config.bank.baseCurrency;

    const documents: SeedDocument[] = CURRENCY_CODES.map((code) => {
      const currency = getCurrency(code);

      return {
        code: currency.code,
        numericCode: currency.numericCode,
        name: currency.name,
        symbol: currency.symbol,
        exponent: currency.exponent,
        enabled: enabled.has(currency.code),
        isBaseCurrency: currency.code === base,
      };
    });

    return this.writer.sync({
      collection: CURRENCIES_COLLECTION,
      keyFields: ['code'],
      documents,
    });
  }
}
