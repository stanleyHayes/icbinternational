'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

/** Entrance timing: strong ease-out, so content starts fast and settles hard. */
const TRANSITION =
  'transform 480ms var(--rb-ease-emphasized), opacity 480ms var(--rb-ease-emphasized)';

/** Where an element sits before it enters: one rem below its resting place, transparent. */
const HIDDEN_TRANSFORM = 'translateY(1rem)';
const VISIBLE_TRANSFORM = 'none';

/** Seen when 15% is on screen and the leading edge has cleared the bottom fold by 8%. */
const THRESHOLD = 0.15;
const ROOT_MARGIN = '0px 0px -8% 0px';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface RevealProps {
  readonly children: ReactNode;
  /** The tag rendered, so the wrapper can stand in for the list item it replaces. */
  readonly as?: ElementType;
  readonly className?: string;
  /** Stagger delay in milliseconds, applied to the entrance transition. */
  readonly delay?: number;
}

/**
 * Reveals its content the first time it scrolls into view.
 *
 * The server render is always the final state, so no-JS and pre-hydration pages show
 * everything; the hidden state is applied on the first animation frame after mount, from
 * the effect — never in server HTML. Under `prefers-reduced-motion` nothing is hidden and
 * no observer is created, so the content simply stays in its final state (the blanket
 * clamp in `globals.css` collapses the transition itself).
 */
export function Reveal({ children, as: Tag = 'div', className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: THRESHOLD, rootMargin: ROOT_MARGIN },
    );

    // Hide on the next frame rather than in the effect body: the mount paint stays fully
    // visible, and a state change inside a callback does not cascade renders.
    const frame = requestAnimationFrame(() => {
      setVisible(false);
      observer.observe(element);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const style: CSSProperties = {
    transition: TRANSITION,
    transitionDelay: `${delay}ms`,
    opacity: visible ? 1 : 0,
    transform: visible ? VISIBLE_TRANSFORM : HIDDEN_TRANSFORM,
  };

  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}
