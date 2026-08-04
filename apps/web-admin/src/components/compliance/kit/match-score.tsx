/**
 * A fuzzy match score, shown so it can be argued with.
 *
 * A screening engine returns a number between 0 and 100, and the whole job is deciding
 * whether that number means the customer. Printing "87" alone invites an analyst to treat
 * the threshold as the decision; printing it with the band it falls in — and the words
 * "strong", "possible", "weak" — keeps the number as evidence rather than a verdict.
 *
 * The bar is decorative. The figure and the band are both text, so nothing here depends
 * on seeing colour or on the bar rendering at all.
 */

'use client';

import { cn } from '@reliance/ui';

/** At or above this, the identifiers usually agree and a true match is likely. */
const STRONG_SCORE = 85;
/** At or above this, enough agrees that a person must look. */
const POSSIBLE_SCORE = 65;
const FULL_SCORE = 100;

const BAR_TONE = {
  strong: 'bg-danger',
  possible: 'bg-warning',
  weak: 'bg-fg-subtle',
} as const;

type Band = keyof typeof BAR_TONE;

const BAND_LABEL: Record<Band, string> = {
  strong: 'Strong match',
  possible: 'Possible match',
  weak: 'Weak match',
};

/** Which band a score falls in. Exported so a queue can filter and sort on it. */
export function scoreBand(score: number): Band {
  if (score >= STRONG_SCORE) return 'strong';
  if (score >= POSSIBLE_SCORE) return 'possible';
  return 'weak';
}

/** The band in words, for a table cell and for an export. */
export function scoreBandLabel(score: number): string {
  return BAND_LABEL[scoreBand(score)];
}

export interface MatchScoreProps {
  /** Confidence from the screening engine, 0–100. */
  readonly score: number;
  /** Hides the bar where a dense table has no room for it. */
  readonly compact?: boolean;
}

/** A match score with its band stated in words. */
export function MatchScore({ score, compact }: MatchScoreProps) {
  const band = scoreBand(score);

  return (
    <span className="flex items-center gap-2">
      <span className="text-fg font-mono text-sm tabular-nums">{score}</span>
      {!compact && (
        <span
          aria-hidden="true"
          className="rounded-pill bg-surface-sunken h-1.5 w-16 overflow-hidden"
        >
          <span
            className={cn('rounded-pill block h-full', BAR_TONE[band])}
            style={{ width: `${Math.min(score, FULL_SCORE)}%` }}
          />
        </span>
      )}
      <span className="font-body text-fg-muted text-xs">{BAND_LABEL[band]}</span>
    </span>
  );
}
