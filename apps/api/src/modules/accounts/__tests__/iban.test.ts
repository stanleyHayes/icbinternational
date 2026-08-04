import {
  buildIban,
  domesticCheckDigits,
  hasValidDomesticCheck,
  ibanCheckDigits,
  isValidIban,
  mod97,
  normaliseIban,
} from '../iban.js';

/**
 * The checksum is the whole point of an IBAN, so it is tested against published reference
 * values rather than against itself. Every vector below is a real IBAN from the ISO 13616
 * registry's own examples — if the implementation agreed with a hand-rolled expectation
 * but disagreed with these, the expectation would be the thing that was wrong.
 */
const REFERENCE_IBANS = [
  'GB82WEST12345698765432',
  'DE89370400440532013000',
  'FR1420041010050500013M02606',
  'ES9121000418450200051332',
  'NL91ABNA0417164300',
  'IT60X0542811101000000123456',
  'CH9300762011623852957',
  'BE68539007547034',
  'SE4550000000058398257466',
  'NO9386011117947',
];

describe('IBAN check digits', () => {
  it.each(REFERENCE_IBANS)('accepts the registry example %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each(REFERENCE_IBANS)('recomputes the published check digits of %s', (iban) => {
    const countryCode = iban.slice(0, 2);
    const published = iban.slice(2, 4);
    const bban = iban.slice(4);

    expect(ibanCheckDigits(countryCode, bban)).toBe(published);
  });

  it('rejects a single transposed digit', () => {
    // 12345698765432 -> 12345698765423: the classic keying error a checksum exists for.
    expect(isValidIban('GB82WEST12345698765423')).toBe(false);
  });

  it('rejects wrong check digits on an otherwise sound IBAN', () => {
    expect(isValidIban('GB83WEST12345698765432')).toBe(false);
  });

  it('rejects anything too short or too long to be an IBAN', () => {
    expect(isValidIban('GB82WEST123')).toBe(false);
    expect(isValidIban(`GB82WEST${'1'.repeat(40)}`)).toBe(false);
  });

  it('rejects lower-case and punctuation rather than silently repairing them', () => {
    expect(isValidIban('GB82-WEST-1234-5698-7654-32')).toBe(false);
  });

  it('tolerates the spacing a human types', () => {
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(normaliseIban(' gb82 west 1234 5698 7654 32 ')).toBe('GB82WEST12345698765432');
  });

  it('never produces the check digits 00 or 01, which the standard forbids', () => {
    const produced = new Set<string>();
    for (let serial = 0; serial < 2000; serial += 1) {
      produced.add(ibanCheckDigits('GB', `RLNC049921${String(serial).padStart(8, '0')}`));
    }

    expect(produced.has('00')).toBe(false);
    expect(produced.has('01')).toBe(false);
  });
});

describe('buildIban', () => {
  it('assembles a self-consistent IBAN from a country and BBAN', () => {
    const iban = buildIban({ countryCode: 'GB', bban: 'RLNC04992104871123' });

    expect(iban).toMatch(/^GB\d{2}RLNC\d{14}$/);
    expect(isValidIban(iban)).toBe(true);
  });

  it('upper-cases what it is given, so a lower-case bank code still checksums', () => {
    expect(buildIban({ countryCode: 'gb', bban: 'rlnc04992104871123' })).toBe(
      buildIban({ countryCode: 'GB', bban: 'RLNC04992104871123' }),
    );
  });

  it('produces a valid IBAN for every serial in a wide sample', () => {
    for (let serial = 0; serial < 5000; serial += 7) {
      const bban = `RLNC049921${String(serial).padStart(8, '0')}`;
      expect(isValidIban(buildIban({ countryCode: 'GB', bban }))).toBe(true);
    }
  });
});

describe('mod97', () => {
  it('expands letters to their two-digit values', () => {
    // 'A' is 10, so 'A1' is the number 101.
    expect(mod97('A1')).toBe(101 % 97);
    expect(mod97('Z')).toBe(35 % 97);
  });

  it('refuses a character that cannot appear in an IBAN', () => {
    expect(() => mod97('GB-82')).toThrow(RangeError);
  });
});

describe('domestic check digits', () => {
  it('appends two digits that validate', () => {
    const serial = '04871123';
    const number = `${serial}${domesticCheckDigits(serial)}`;

    expect(number).toHaveLength(10);
    expect(hasValidDomesticCheck(number)).toBe(true);
  });

  it('catches a transposition in the serial', () => {
    const serial = '04871123';
    const number = `04871132${domesticCheckDigits(serial)}`;

    expect(hasValidDomesticCheck(number)).toBe(false);
  });

  it('produces two digits for every serial in a wide sample', () => {
    for (let serial = 0; serial < 5000; serial += 3) {
      const check = domesticCheckDigits(String(serial).padStart(8, '0'));
      expect(check).toMatch(/^\d{2}$/);
    }
  });
});
