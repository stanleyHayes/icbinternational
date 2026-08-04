// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The expiry notice has to be *announced*, not merely drawn.
 *
 * A live region only reports changes to a region assistive technology was already watching. If the
 * region enters the DOM already holding "this price has expired", nothing is announced and the
 * customer who cannot see the panel goes on believing the price is live.
 */

import { render } from '@testing-library/react';

import { QuoteTimer } from './quote-timer';
import { countdownLabel, type QuoteExpiry } from './use-quote-expiry';

const WINDOW_SECONDS = 60;
const RUNNING_SECONDS = 42;

function running(): QuoteExpiry {
  return {
    remaining: RUNNING_SECONDS,
    expired: false,
    known: true,
    label: countdownLabel(RUNNING_SECONDS),
    urgent: false,
  };
}

function expired(): QuoteExpiry {
  return { remaining: 0, expired: true, known: true, label: countdownLabel(0), urgent: false };
}

function liveRegion(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[aria-live="polite"]');
}

describe('QuoteTimer', () => {
  it('mounts the live region empty while the quote is still good', () => {
    const { container } = render(
      <QuoteTimer expiry={running()} windowSeconds={WINDOW_SECONDS} onRequote={jest.fn()} />,
    );

    const region = liveRegion(container);
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe('');
  });

  it('announces expiry by filling the region that was already there', () => {
    const { container, rerender } = render(
      <QuoteTimer expiry={running()} windowSeconds={WINDOW_SECONDS} onRequote={jest.fn()} />,
    );
    const before = liveRegion(container);

    rerender(
      <QuoteTimer expiry={expired()} windowSeconds={WINDOW_SECONDS} onRequote={jest.fn()} />,
    );

    // Same node, new content: that is the mutation assistive technology reports. A region that is
    // inserted alongside its message is a different node, and is announced by nobody.
    expect(liveRegion(container)).toBe(before);
    expect(before?.textContent).toContain('has expired');
  });

  it('does not put a second live region inside the visible expired notice', () => {
    const { container } = render(
      <QuoteTimer expiry={expired()} windowSeconds={WINDOW_SECONDS} onRequote={jest.fn()} />,
    );

    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('still counts down in words while the quote is live', () => {
    const { container } = render(
      <QuoteTimer expiry={running()} windowSeconds={WINDOW_SECONDS} onRequote={jest.fn()} />,
    );

    expect(container.textContent).toContain(`expires in ${countdownLabel(RUNNING_SECONDS)}`);
  });
});
