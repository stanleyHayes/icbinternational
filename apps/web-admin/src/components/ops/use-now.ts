/**
 * The console's ticking "now".
 *
 * SLA clocks and queue ages are only useful if they move, but re-reading the clock on
 * every render would make every table re-render on every keystroke elsewhere on the
 * screen. One shared, slow tick is enough: nothing in a back office is decided on the
 * strength of a second.
 */

'use client';

import { useEffect, useState } from 'react';

/** How often the shared instant advances. Slow enough to be free, fast enough to feel live. */
const TICK_MS = 30_000;

/**
 * The current instant in epoch milliseconds, refreshed on a slow tick.
 *
 * Pass it to {@link formatElapsed} and {@link isOverdue} rather than letting those read
 * the clock themselves, so a component's output stays a pure function of its inputs.
 */
export function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
}
