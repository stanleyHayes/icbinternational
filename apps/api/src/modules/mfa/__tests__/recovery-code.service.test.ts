import { RECOVERY_CODE_COUNT, RecoveryCodeService } from '../recovery-code.service.js';

const CODE_PATTERN = /^[0-9A-HJ-KM-NP-TV-Z]{5}-[0-9A-HJ-KM-NP-TV-Z]{5}$/;

describe('RecoveryCodeService', () => {
  const service = new RecoveryCodeService();

  it('mints ten display-formatted codes with matching hashes', () => {
    const set = service.generate();

    expect(set.codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(set.hashes).toHaveLength(RECOVERY_CODE_COUNT);
    for (const code of set.codes) expect(code).toMatch(CODE_PATTERN);
    expect(new Set(set.codes).size).toBe(RECOVERY_CODE_COUNT);
    expect(set.hashes).toEqual(set.codes.map((code) => service.hashOf(code)));
  });

  it('never stores anything resembling the plaintext code', () => {
    const set = service.generate();
    for (const [index, hash] of set.hashes.entries()) {
      expect(hash).not.toContain(set.codes[index] ?? '');
    }
  });

  it('matches a code typed in lower case without the dash', () => {
    const [code] = service.generate().codes;
    const typed = (code ?? '').replace('-', '').toLowerCase();

    expect(service.matches(typed, service.generate().hashes)).toBe(false);
    expect(service.hashOf(typed)).toBe(service.hashOf(code ?? ''));
  });

  it('matches only unspent hashes', () => {
    const set = service.generate();
    const [first] = set.codes;

    expect(service.matches(first ?? '', set.hashes)).toBe(true);
    expect(service.matches('AAAAA-AAAAA', set.hashes)).toBe(false);
  });
});
