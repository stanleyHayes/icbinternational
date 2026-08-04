/**
 * The tokens are generated, so what is worth testing is not their values but the invariants the
 * rest of the system relies on: the money colours are the brand's, every role the CSS defines is
 * named in TypeScript, and nothing in the palette has drifted away from the brand file.
 */

import brandFile from '../../../../brand/tokens/brand.tokens.json';

import { MONEY_ROLE, roleVar, SOFT_THEME_ROLES, THEME_ROLES, tokens } from './tokens.js';

describe('brand tokens', () => {
  it('mirrors brand/tokens/brand.tokens.json exactly', () => {
    // The generator copies the brand file into the package; if this fails, the copy is stale and
    // `pnpm --filter @reliance/ui theme` has not been run.
    expect(tokens).toEqual(brandFile);
  });

  it('keeps the money semantics the brand fixed', () => {
    expect(tokens.color.semantic.credit).toBe('#00A578');
    expect(tokens.color.semantic.debit).toBe('#D9534F');
    expect(tokens.color.semantic.pending).toBe('#D8B54A');
  });

  it('uses Outfit for every text role', () => {
    const { display, body, numeric } = tokens.typography.fontFamily;

    expect(display).toContain('Outfit');
    expect(body).toContain('Outfit');
    expect(numeric).toContain('Outfit');
  });
});

describe('theme roles', () => {
  it('names the roles components depend on', () => {
    for (const role of ['surface', 'fg', 'border', 'accent', 'credit', 'debit', 'pending']) {
      expect(THEME_ROLES).toContain(role);
    }
  });

  it('gives every soft role a base role to tint from', () => {
    for (const role of SOFT_THEME_ROLES) {
      expect(THEME_ROLES).toContain(role);
    }
  });

  it('resolves a role to its custom property', () => {
    expect(roleVar('credit')).toBe('var(--rb-color-credit)');
    expect(roleVar('credit-soft')).toBe('var(--rb-color-credit-soft)');
  });
});

describe('MONEY_ROLE', () => {
  it('maps direction to the fixed brand roles, with zero left neutral', () => {
    expect(MONEY_ROLE).toEqual({
      credit: 'credit',
      debit: 'debit',
      pending: 'pending',
      zero: 'fg-muted',
    });
  });
});
