/**
 * The preset is the JS twin of the generated `@theme` CSS. The invariant that matters is the
 * brand rule itself: nothing in it may be a literal colour — every value resolves through a
 * custom property back to `brand.tokens.json`, so a re-skin is one file, not two hundred.
 */

import { relianceTailwindPreset } from '../tailwind-preset.js';

const HEX_LITERAL = /#[0-9a-f]{3,8}\b/i;
const { extend } = relianceTailwindPreset.theme;

describe('relianceTailwindPreset', () => {
  it('contains no hard-coded hex anywhere', () => {
    expect(JSON.stringify(relianceTailwindPreset)).not.toMatch(HEX_LITERAL);
  });

  it('maps semantic roles to their role variables', () => {
    expect(extend.colors['canvas']).toBe('var(--rb-color-canvas)');
    expect(extend.colors['fg-muted']).toBe('var(--rb-color-fg-muted)');
    expect(extend.colors['accent-soft']).toBe('var(--rb-color-accent-soft)');
    expect(extend.colors['credit']).toBe('var(--rb-color-credit)');
  });

  it('maps palette ramps to their palette variables', () => {
    expect(extend.colors['navy-500']).toBe('var(--rb-palette-navy-500)');
    expect(extend.colors['green-600']).toBe('var(--rb-palette-green-600)');
    expect(extend.colors['brand-credit']).toBe('var(--rb-palette-credit)');
  });

  it('splits the font stacks into arrays, Outfit first', () => {
    expect(extend.fontFamily['display']?.[0]).toBe("'Outfit'");
    expect(extend.fontFamily['body']?.[0]).toBe("'Outfit'");
    expect(extend.fontFamily['mono']?.[0]).toBe("'JetBrains Mono'");
  });

  it('binds type, shape, elevation and motion scales to their variables', () => {
    expect(extend.fontSize['4xl']).toBe('var(--rb-text-4xl)');
    expect(extend.borderRadius['pill']).toBe('var(--rb-radius-pill)');
    expect(extend.boxShadow['card']).toBe('var(--rb-shadow-card)');
    expect(extend.transitionDuration['base']).toBe('var(--rb-duration-base)');
    expect(extend.transitionTimingFunction['spring']).toBe('var(--rb-ease-spring)');
  });

  it('ships the named motion primitives, timed by the motion tokens', () => {
    expect(extend.animation['fade-in']).toContain('var(--rb-duration-fast)');
    expect(extend.animation['skeleton']).toContain('infinite');
    expect(Object.keys(extend.keyframes)).toEqual(
      expect.arrayContaining(['rb-fade-in', 'rb-scale-in', 'rb-slide-up', 'rb-skeleton']),
    );
  });
});
