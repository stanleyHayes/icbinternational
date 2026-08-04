/**
 * The typography presets are the only sanctioned compositions of the type tokens; the shared
 * class strings in `styles.ts` are the only sanctioned focus ring, transition and field chrome.
 * These tests pin the invariants rather than the exact strings: token-backed utilities only,
 * and the affordances (tabular digits, visible focus, legible disabled) always present.
 */

import { DISABLED, FOCUS_RING, FOCUS_RING_INSET, TABULAR, TRANSITION_STATE } from './styles.js';
import { TEXT_STYLE } from './typography.js';

const FONT_FAMILY_UTILITY = /^font-(display|body|mono|numeric)\b/;

describe('TEXT_STYLE', () => {
  it('starts every style with a token-backed font family', () => {
    for (const classes of Object.values(TEXT_STYLE)) {
      expect(classes).toMatch(FONT_FAMILY_UTILITY);
    }
  });

  it('uses only brand scale sizes and role colours for text', () => {
    const allowed = /^(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|fg|fg-muted)$/;

    for (const classes of Object.values(TEXT_STYLE)) {
      for (const utility of classes.split(' ')) {
        if (!utility.startsWith('text-')) continue;
        expect(allowed.test(utility.slice('text-'.length))).toBe(true);
      }
    }
  });

  it('gives every style a role colour, never a palette shade', () => {
    for (const classes of Object.values(TEXT_STYLE)) {
      expect(classes).toMatch(/\btext-fg(-muted)?\b/);
      expect(classes).not.toMatch(/\btext-(navy|green|gold|slate)-\d/);
    }
  });

  it('fixes digits in the numeric style, so a live balance never reflows', () => {
    expect(TEXT_STYLE.numeric).toContain(TABULAR);
  });
});

describe('shared class strings', () => {
  it('shows the focus ring only to keyboard users', () => {
    for (const ring of [FOCUS_RING, FOCUS_RING_INSET]) {
      expect(ring).toContain('focus-visible:');
      expect(ring).toContain('ring-focus');
    }
  });

  it('keeps disabled controls legible', () => {
    expect(DISABLED).toContain('disabled:opacity-60');
    expect(DISABLED).toContain('disabled:cursor-not-allowed');
  });

  it('drives state transitions from the motion tokens', () => {
    expect(TRANSITION_STATE).toContain('--rb-duration-fast');
  });
});
