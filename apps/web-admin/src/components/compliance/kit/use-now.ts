/**
 * The clock the workstations read.
 *
 * Everything in `@/lib/format` takes "now" as a parameter on purpose, so exactly one
 * place in this lane is allowed to produce it. Keeping it here means an SLA cell, a queue
 * age and a case timer on the same screen all agree to the second, and a test can render
 * any of them at a fixed instant by passing its own value instead.
 *
 * It ticks rather than reading once per render: an analyst leaves a queue open for hours,
 * and a countdown frozen at the moment the page loaded is worse than no countdown at all.
 */

'use client';

import { useEffect, useState } from 'react';

/** How often the workstation clock advances. Fine enough for a minute-resolution SLA. */
const TICK_INTERVAL_MS = 15_000;

/**
 * The current instant in epoch milliseconds, refreshed while the screen is open.
 *
 * @returns Epoch milliseconds, updated roughly every fifteen seconds.
 */
export function useConsoleNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
}
