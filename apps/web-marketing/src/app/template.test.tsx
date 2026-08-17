// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The route template is a motion-only boundary: it wraps the page in the page-enter
 * animation and adds nothing else — no spacing, no width, no extra semantics.
 */

import { render, screen } from '@testing-library/react';

import Template from './template';

describe('Template', () => {
  it('renders children inside the page-enter wrapper', () => {
    render(
      <Template>
        <p>Page body</p>
      </Template>,
    );

    const wrapper = screen.getByText('Page body').parentElement;
    expect(wrapper?.className).toBe('motion-safe:animate-page-enter');
  });

  it('adds no margin, padding or width of its own', () => {
    render(
      <Template>
        <p>Page body</p>
      </Template>,
    );

    const wrapper = screen.getByText('Page body').parentElement;
    expect(wrapper?.className).not.toMatch(/m-|p-|max-w|w-/);
  });
});
