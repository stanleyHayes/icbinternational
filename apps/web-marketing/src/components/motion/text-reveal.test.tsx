// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The headline-reveal contract: lines start translated inside their masks, rise in a 70ms
 * stagger on mount, and under `prefers-reduced-motion` nothing is ever hidden.
 */

import { act, render, screen } from '@testing-library/react';

import { FadeIn, LINE_STAGGER_MS, TextReveal } from './text-reveal';

/** Pending animation-frame callbacks, in request order. */
let pendingFrames: FrameRequestCallback[];

function stubMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function stubAnimationFrame() {
  pendingFrames = [];
  window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  });
  window.cancelAnimationFrame = jest.fn();
}

/** Runs the next pending animation frame, inside `act`. */
function runFrame() {
  const frame = pendingFrames.shift();
  act(() => {
    frame?.(0);
  });
}

beforeEach(() => {
  stubAnimationFrame();
});

describe('TextReveal', () => {
  it('renders every line inside its own overflow-hidden mask', () => {
    stubMatchMedia(false);
    const { container } = render(<TextReveal lines={['First line', 'Second line']} />);

    const masks = [...container.querySelectorAll('span')].filter(
      (span) => span.style.overflow === 'hidden',
    );
    expect(masks).toHaveLength(2);
    expect(screen.getByText('First line')).toBeTruthy();
    expect(screen.getByText('Second line')).toBeTruthy();
  });

  it('starts each line translated, then lifts it a frame later', () => {
    stubMatchMedia(false);
    render(<TextReveal lines={['Rising line']} />);

    const line = screen.getByText('Rising line');
    expect(line.style.transform).toBe('none');

    runFrame();

    expect(line.style.transform).toBe('translateY(110%)');
    expect(line.style.transition).toContain('640ms var(--rb-ease-emphasized)');

    runFrame();

    expect(line.style.transform).toBe('none');
  });

  it('staggers lines 70ms apart', () => {
    stubMatchMedia(false);
    render(<TextReveal lines={['One', 'Two', 'Three']} />);

    const delays = ['One', 'Two', 'Three'].map(
      (text) => screen.getByText(text).style.transitionDelay,
    );
    expect(delays).toEqual(['0ms', '70ms', '140ms']);
  });

  it('never hides under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    render(<TextReveal lines={['Still line']} />);

    const line = screen.getByText('Still line');
    expect(line.style.transform).toBe('none');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});

describe('FadeIn', () => {
  it('fades supporting copy in after the last line starts', () => {
    stubMatchMedia(false);
    render(
      <FadeIn delay={2 * LINE_STAGGER_MS}>
        <p>Supporting copy</p>
      </FadeIn>,
    );

    const wrapper = screen.getByText('Supporting copy').parentElement;
    expect(wrapper?.style.transition).toContain('opacity 420ms var(--rb-ease-decelerate)');
    expect(wrapper?.style.transitionDelay).toBe('140ms');

    runFrame();

    expect(wrapper?.style.opacity).toBe('0');

    runFrame();

    expect(wrapper?.style.opacity).toBe('1');
  });

  it('stays visible under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    render(
      <FadeIn delay={LINE_STAGGER_MS}>
        <p>Still copy</p>
      </FadeIn>,
    );

    expect(screen.getByText('Still copy').parentElement?.style.opacity).toBe('1');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
