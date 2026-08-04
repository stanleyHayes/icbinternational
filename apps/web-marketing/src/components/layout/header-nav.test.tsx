// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * Two confirmed failures in the mega-menu, held here so they cannot come back.
 *
 * A collapsed trigger used to point `aria-controls` at a panel that does not exist until it opens,
 * which is a dangling IDREF; and Escape used to unmount the panel with focus inside it, dropping
 * the customer at `<body>` so their next Tab restarted at the top of the document.
 */

import { render, screen } from '@testing-library/react';

import { NAV_SECTIONS } from '@/content/navigation';

import { setupUser } from '../../test/user';


import { HeaderNav } from './header-nav';

const FIRST_SECTION = NAV_SECTIONS[0];

/**
 * The desktop mega-menu triggers only.
 *
 * The mobile menu button carries the same dangling-IDREF defect from `header-actions.tsx`, which
 * belongs to another lane; see `docs/HANDOFFS.md`.
 */
function triggers(): HTMLElement[] {
  const bar = screen.getByRole('navigation', { name: 'Main' });
  return [...bar.querySelectorAll<HTMLElement>('button')];
}

function firstTrigger(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${FIRST_SECTION?.label ?? ''}`) });
}

describe('HeaderNav', () => {
  it('never points aria-controls at an element that is not in the document', async () => {
    const user = setupUser();
    render(<HeaderNav />);

    for (const trigger of triggers()) {
      const controls = trigger.getAttribute('aria-controls');
      if (controls !== null) expect(document.getElementById(controls)).not.toBeNull();
    }

    await user.click(firstTrigger());

    for (const trigger of triggers()) {
      const controls = trigger.getAttribute('aria-controls');
      if (controls !== null) expect(document.getElementById(controls)).not.toBeNull();
    }
  });

  it('claims aria-controls once the panel it names is open', async () => {
    const user = setupUser();
    render(<HeaderNav />);
    const trigger = firstTrigger();

    expect(trigger.getAttribute('aria-controls')).toBeNull();

    await user.click(trigger);

    const controls = trigger.getAttribute('aria-controls');
    expect(controls).not.toBeNull();
    expect(document.getElementById(controls as string)).not.toBeNull();
  });

  it('returns focus to the trigger when Escape closes the panel', async () => {
    const user = setupUser();
    render(<HeaderNav />);
    const trigger = firstTrigger();

    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await user.keyboard('{Escape}');

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus even when Escape is pressed from inside the panel', async () => {
    const user = setupUser();
    render(<HeaderNav />);
    const trigger = firstTrigger();

    await user.click(trigger);
    const panelLink = screen.getByRole('link', {
      name: new RegExp(FIRST_SECTION?.links[0]?.label ?? '', 'i'),
    });
    panelLink.focus();

    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(trigger);
  });
});
