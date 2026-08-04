import { EntryType, SpendCategory } from '@reliance/contracts';

import { CategorisationService } from '../categorisation.service.js';

const service = new CategorisationService();

describe('CategorisationService', () => {
  describe('merchant category codes', () => {
    it.each([
      ['5411', SpendCategory.GROCERIES, 'a supermarket'],
      ['5814', SpendCategory.DINING, 'fast food'],
      ['5541', SpendCategory.FUEL, 'a service station'],
      ['4900', SpendCategory.UTILITIES, 'a utility'],
      ['6011', SpendCategory.CASH, 'an ATM'],
      ['8062', SpendCategory.HEALTH, 'a hospital'],
      ['8220', SpendCategory.EDUCATION, 'a university'],
      ['3501', SpendCategory.TRAVEL, 'a hotel'],
      ['7997', SpendCategory.ENTERTAINMENT, 'a members club'],
    ])('maps %s to %s (%s)', (mcc, expected, _description) => {
      expect(service.categorise({ type: EntryType.CARD_PURCHASE, mcc })).toBe(expected);
    });

    it('prefers an exact code over the range containing it', () => {
      // 5814 sits inside the 5800s, which are dining anyway — but 5541 sits inside the
      // 5500s, which are transport. Fuel must win, or petrol reads as car hire.
      expect(service.categorise({ type: EntryType.CARD_PURCHASE, mcc: '5541' })).toBe(
        SpendCategory.FUEL,
      );
      expect(service.categorise({ type: EntryType.CARD_PURCHASE, mcc: '5511' })).toBe(
        SpendCategory.TRANSPORT,
      );
    });

    it('falls back to the entry type for an unrecognised code', () => {
      expect(service.categorise({ type: EntryType.ATM_WITHDRAWAL, mcc: '9999' })).toBe(
        SpendCategory.CASH,
      );
    });

    it('ignores a merchant code on an entry type where it describes something adjacent', () => {
      // A non-sterling fee triggered by a restaurant meal carries the restaurant MCC.
      // Filing it under Dining would silently under-report the customer's fees.
      expect(service.categorise({ type: EntryType.FEE, mcc: '5814' })).toBe(SpendCategory.FEES);
    });
  });

  describe('entry types', () => {
    it.each([
      [EntryType.ATM_WITHDRAWAL, SpendCategory.CASH],
      [EntryType.DIRECT_DEBIT, SpendCategory.SUBSCRIPTIONS],
      [EntryType.INTEREST_CREDIT, SpendCategory.INCOME],
      [EntryType.ROUND_UP, SpendCategory.SAVINGS],
      [EntryType.DOMESTIC_TRANSFER, SpendCategory.TRANSFERS],
    ])('maps %s to %s with no merchant code', (type, expected) => {
      expect(service.categorise({ type, mcc: null })).toBe(expected);
    });

    it('admits ignorance rather than guessing on a manual adjustment', () => {
      expect(service.categorise({ type: EntryType.MANUAL_ADJUSTMENT, mcc: null })).toBe(
        SpendCategory.UNCATEGORISED,
      );
    });
  });

  describe('customer overrides', () => {
    it('always wins, even against a merchant code that says otherwise', () => {
      expect(
        service.categorise({
          type: EntryType.CARD_PURCHASE,
          mcc: '5814',
          override: SpendCategory.HEALTH,
        }),
      ).toBe(SpendCategory.HEALTH);
    });
  });

  it('is pure — the same input always gives the same answer', () => {
    const input = { type: EntryType.CARD_PURCHASE, mcc: '5411' };
    expect(service.categorise(input)).toBe(service.categorise(input));
  });
});
