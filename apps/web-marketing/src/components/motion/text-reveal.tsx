'use client';

import { isValidElement, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** Line entrance: the same strong ease-out as the scroll reveals, a touch slower. */
const LINE_TRANSITION = 'transform 640ms var(--rb-ease-emphasized)';

/** Supporting copy fades in once the last line has started moving. */
const FADE_TRANSITION = 'opacity 420ms var(--rb-ease-decelerate)';

/** The stagger between headline lines, in milliseconds. */
export const LINE_STAGGER_MS = 70;

/** Where a line sits before it enters: just past the bottom edge of its mask. */
const HIDDEN_TRANSFORM = 'translateY(110%)';
const VISIBLE_TRANSFORM = 'none';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The mount lifecycle every entrance here shares.
 *
 * The server render is always the final state, so no-JS and pre-hydration pages show
 * everything. On mount the hidden state is applied on the first animation frame and lifted
 * on the second — the frame in between is what lets the transition run. Under
 * `prefers-reduced-motion` nothing is hidden at all: this is first paint, so reduced
 * motion means no animation, not an opacity-only compromise.
 */
function useMountReveal(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    let revealFrame = 0;
    const hideFrame = requestAnimationFrame(() => {
      setVisible(false);
      revealFrame = requestAnimationFrame(() => setVisible(true));
    });

    return () => {
      cancelAnimationFrame(hideFrame);
      cancelAnimationFrame(revealFrame);
    };
  }, []);

  return visible;
}

/** A stable key for a line: its text, or the key its element already carries. */
function lineKey(line: ReactNode): string {
  if (isValidElement(line) && line.key !== null) return line.key;
  return String(line);
}

function lineStyle(visible: boolean, index: number): CSSProperties {
  return {
    display: 'block',
    transition: LINE_TRANSITION,
    transitionDelay: `${index * LINE_STAGGER_MS}ms`,
    transform: visible ? VISIBLE_TRANSFORM : HIDDEN_TRANSFORM,
  };
}

export interface TextRevealProps {
  /** The headline's lines, as authored — never auto-split mid-string. */
  readonly lines: readonly ReactNode[];
  readonly className?: string;
  readonly lineClassName?: string;
}

/**
 * A masked line-by-line reveal for a headline, played once on mount.
 *
 * Each line sits in an overflow-hidden mask and slides up out of it, 70ms apart. The masks
 * are spans rather than divs so the wrapper is valid inside a heading.
 */
export function TextReveal({ lines, className, lineClassName }: TextRevealProps) {
  const visible = useMountReveal();

  return (
    <span className={className}>
      {lines.map((line, index) => (
        <span key={lineKey(line)} style={{ display: 'block', overflow: 'hidden' }}>
          <span className={lineClassName} style={lineStyle(visible, index)}>
            {line}
          </span>
        </span>
      ))}
    </span>
  );
}

export interface FadeInProps {
  readonly children: ReactNode;
  /** Delay in milliseconds — pass `lines.length * LINE_STAGGER_MS` of the headline above. */
  readonly delay?: number;
  readonly className?: string;
}

/** The fade for the copy supporting a `TextReveal` headline: opacity only, after the lines. */
export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  const visible = useMountReveal();

  const style: CSSProperties = {
    transition: FADE_TRANSITION,
    transitionDelay: `${delay}ms`,
    opacity: visible ? 1 : 0,
  };

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
