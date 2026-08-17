// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The scroll-reveal contract: the server render is fully visible, the hidden state arrives
 * on the first animation frame after mount, the reveal fires on first intersection, and
 * under `prefers-reduced-motion` nothing is ever hidden or observed.
 */

import { act, render, screen } from '@testing-library/react';

import { Reveal } from './reveal';
import { RevealGroup } from './reveal-group';

type ObserverCallback = (
  entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting'>>,
) => void;

/** The callback each mocked observer was constructed with, in construction order. */
let observerCallbacks: ObserverCallback[];
let observerOptions: IntersectionObserverInit[];
let disconnectCount: number;

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

function stubIntersectionObserver() {
  observerCallbacks = [];
  observerOptions = [];
  disconnectCount = 0;

  window.IntersectionObserver = jest.fn(
    (callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
      observerCallbacks.push((entries) =>
        callback(entries as IntersectionObserverEntry[], {} as IntersectionObserver),
      );
      observerOptions.push(options ?? {});
      return {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(() => {
          disconnectCount += 1;
        }),
      };
    },
  ) as unknown as typeof IntersectionObserver;
}

function stubAnimationFrame() {
  pendingFrames = [];
  window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  });
  window.cancelAnimationFrame = jest.fn();
}

/** Runs every pending animation frame, inside `act`. */
function runFrames() {
  act(() => {
    for (const frame of pendingFrames.splice(0)) frame(0);
  });
}

/** Fires `isIntersecting` on every observer created so far, inside `act`. */
function intersectAll() {
  act(() => {
    for (const callback of observerCallbacks) callback([{ isIntersecting: true }]);
  });
}

function wrapperOf(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement;
  if (element === null) throw new Error(`no wrapper found for "${text}"`);
  return element;
}

beforeEach(() => {
  stubIntersectionObserver();
  stubAnimationFrame();
});

describe('Reveal', () => {
  it('renders visible, hides on the first frame, and reveals on first intersection', () => {
    stubMatchMedia(false);
    render(
      <Reveal>
        <p>Section body</p>
      </Reveal>,
    );

    const wrapper = wrapperOf('Section body');
    expect(wrapper.style.opacity).toBe('1');

    runFrames();

    expect(wrapper.style.opacity).toBe('0');
    expect(wrapper.style.transform).toBe('translateY(1rem)');
    expect(wrapper.style.transition).toContain('480ms var(--rb-ease-emphasized)');

    intersectAll();

    expect(wrapper.style.opacity).toBe('1');
    expect(wrapper.style.transform).toBe('none');
  });

  it('observes once, with the spec threshold and root margin, and disconnects after', () => {
    stubMatchMedia(false);
    render(
      <Reveal>
        <p>Observed body</p>
      </Reveal>,
    );

    expect(window.IntersectionObserver).toHaveBeenCalledTimes(1);
    expect(observerOptions[0]).toEqual({ threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    runFrames();
    intersectAll();
    expect(disconnectCount).toBe(1);
  });

  it('never hides and never observes under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    render(
      <Reveal>
        <p>Still body</p>
      </Reveal>,
    );

    const wrapper = wrapperOf('Still body');
    expect(wrapper.style.opacity).toBe('1');
    expect(wrapper.style.transform).toBe('none');
    expect(window.IntersectionObserver).not.toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});

describe('RevealGroup', () => {
  it('staggers siblings 60ms apart and renders each as the given tag', () => {
    stubMatchMedia(false);
    render(
      <ul>
        <RevealGroup as="li">
          <p key="first">First item</p>
          <p key="second">Second item</p>
          <p key="third">Third item</p>
        </RevealGroup>
      </ul>,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.style.transitionDelay)).toEqual(['0ms', '60ms', '120ms']);
  });
});
