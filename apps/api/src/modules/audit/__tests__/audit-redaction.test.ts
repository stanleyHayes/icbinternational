import { classifyField, redactChanges, redactValue } from '../audit-redaction.js';
import { REDACTED_PLACEHOLDER } from '../audit.constants.js';

describe('classifyField', () => {
  it.each([
    'password',
    'passwordHash',
    'mfa.totpSecret',
    'refreshToken',
    'card.cvv',
    'authorization',
    'apiKey',
    'sessionId',
  ])('denies credentials like %s', (field) => {
    expect(classifyField(field)).toBe('DENY');
  });

  it.each(['card.pan', 'iban', 'phoneNumber', 'accountNumber', 'nationalId'])(
    'masks identifiers like %s',
    (field) => {
      expect(classifyField(field)).toBe('MASK');
    },
  );

  it.each(['status', 'shippingAddress', 'tokenised', 'limits.daily'])(
    'allows ordinary fields like %s without substring false-positives',
    (field) => {
      expect(classifyField(field)).toBe('ALLOW');
    },
  );
});

describe('redactValue', () => {
  it('replaces a credential wholesale — not even its length survives', () => {
    expect(redactValue('password', 'hunter2')).toBe(REDACTED_PLACEHOLDER);
  });

  it('keeps only the last four of a masked identifier', () => {
    expect(redactValue('iban', 'GB29NWBK60161331926819')).toBe('••••••••••••••••••6819');
  });

  it('masks a short identifier completely', () => {
    expect(redactValue('pan', '1234')).toBe('••••');
  });

  it('redacts a JWT whatever the field is named', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    expect(redactValue('reference', jwt)).toBe(REDACTED_PLACEHOLDER);
  });

  it('masks a value that looks like a card number, whatever the field is named', () => {
    // Luhn-valid test PAN.
    expect(redactValue('notes', '4111 1111 1111 1111')).toBe('••••••••••••1111');
    expect(redactValue('notes', '4111111111111112')).toBe('4111111111111112');
  });

  it('truncates oversized values rather than storing them whole', () => {
    const redacted = redactValue('description', 'x'.repeat(600));

    expect(redacted).toHaveLength(513);
    expect(redacted?.endsWith('…')).toBe(true);
  });

  it('passes null and empty values through untouched', () => {
    expect(redactValue('status', null)).toBeNull();
    expect(redactValue('status', '')).toBe('');
  });
});

describe('redactChanges', () => {
  it('applies the policy to both sides of every change', () => {
    const changes = redactChanges([
      { field: 'status', before: 'ACTIVE', after: 'FROZEN' },
      { field: 'passwordHash', before: 'old-hash', after: 'new-hash' },
    ]);

    expect(changes).toEqual([
      { field: 'status', before: 'ACTIVE', after: 'FROZEN' },
      { field: 'passwordHash', before: REDACTED_PLACEHOLDER, after: REDACTED_PLACEHOLDER },
    ]);
  });

  it('switches to an allow-list when one is given', () => {
    const changes = redactChanges(
      [
        { field: 'firstName', before: 'Grace', after: 'Grace' },
        { field: 'tier', before: 'GOLD', after: 'PLATINUM' },
      ],
      { allowFields: ['tier'] },
    );

    expect(changes).toEqual([{ field: 'tier', before: 'GOLD', after: 'PLATINUM' }]);
  });
});
