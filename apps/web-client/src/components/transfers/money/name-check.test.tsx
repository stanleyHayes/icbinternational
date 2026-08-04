// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * Confirmation of payee is the control that stops a customer paying a fraudster. It only works if
 * the answer reaches them, and for a screen-reader user "reaches them" means a live region that
 * existed *before* the answer arrived.
 */

import { render } from '@testing-library/react';

import type { NameCheck } from '@reliance/api-client';
import { NameCheckResult } from '@reliance/contracts';

import { NameCheckNotice } from './name-check';

const ENTERED_NAME = 'John Smith';

function noMatch(): NameCheck {
  return {
    result: NameCheckResult.NO_MATCH,
    suggestion: 'J Smith',
    message: 'The name does not match this account.',
  };
}

function liveRegion(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[aria-live="polite"]');
}

describe('NameCheckNotice', () => {
  it('mounts the live region empty while the check is still running', () => {
    const { container } = render(<NameCheckNotice result={undefined} enteredName={ENTERED_NAME} />);

    const region = liveRegion(container);
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe('');
  });

  it('announces the result by filling the region that was already there', () => {
    const { container, rerender } = render(
      <NameCheckNotice result={undefined} enteredName={ENTERED_NAME} />,
    );
    const before = liveRegion(container);

    rerender(<NameCheckNotice result={noMatch()} enteredName={ENTERED_NAME} />);

    expect(liveRegion(container)).toBe(before);
    expect(before?.textContent).toContain('does not match');
  });

  it('reads both spellings out, because the gap between them is the whole warning', () => {
    const { container } = render(<NameCheckNotice result={noMatch()} enteredName={ENTERED_NAME} />);

    const text = liveRegion(container)?.textContent ?? '';
    expect(text).toContain(ENTERED_NAME);
    expect(text).toContain('J Smith');
  });

  it('leaves the visible alert out of the live region, so it is announced once', () => {
    const { container } = render(<NameCheckNotice result={noMatch()} enteredName={ENTERED_NAME} />);

    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(liveRegion(container)?.querySelector('dl')).toBeNull();
  });
});
