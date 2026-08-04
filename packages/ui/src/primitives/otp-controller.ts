'use client';

/**
 * The behaviour behind OTPInput, separated from its markup.
 *
 * Six boxes, one value. The invariant that makes the rest simple is that the value stays
 * *compact*: focus is redirected to the first empty box, so a code can never develop a hole and
 * no caller ever has to reason about `"12__56"`.
 */

import { useEffect, useId, useMemo, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { useControllableState } from '../hooks/use-controllable-state.js';

const NON_DIGITS = /\D/g;
const BACKSPACE = 'Backspace';

/** Stand-in for an out-of-range index, so the caller never receives undefined. */
const noopRef = (): void => undefined;

/** Keys that move the caret between boxes, and by how much. Anything else falls through. */
const ARROW_STEP: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

/** Stable keys for the boxes, so the list is not keyed by array position. */
function buildCells(baseId: string, length: number): readonly { readonly id: string }[] {
  return Array.from({ length }, (_, index) => ({ id: `${baseId}-${index}` }));
}

/**
 * Backspace deletes the digit at the caret, or the last digit when the caret has run past the
 * end — which is where it sits after the code is complete, and where users press it first.
 */
function afterBackspace(value: string, index: number): { value: string; focus: number } {
  const target = value.length > 0 && index >= value.length ? value.length - 1 : index;
  return { value: `${value.slice(0, target)}${value.slice(target + 1)}`, focus: target };
}

export interface OtpControllerOptions {
  readonly length: number;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly onComplete?: (value: string) => void;
}

/** Everything OTPInput needs to render and drive its boxes. */
export interface OtpController {
  readonly value: string;
  readonly cells: readonly { readonly id: string }[];
  readonly registerBox: (index: number) => (node: HTMLInputElement | null) => void;
  readonly onDigit: (index: number, raw: string) => void;
  readonly onKeyDown: (index: number, event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onPaste: (index: number, event: ClipboardEvent<HTMLInputElement>) => void;
  readonly onFocus: (index: number) => void;
}

/** Wires value, focus and keyboard handling for a split code field. */
export function useOtpController(options: OtpControllerOptions): OtpController {
  const { length, onComplete } = options;
  const baseId = useId();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const [value, setValue] = useControllableState<string>({
    value: options.value,
    defaultValue: options.defaultValue ?? '',
    onChange: options.onValueChange,
  });
  const cells = useMemo(() => buildCells(baseId, length), [baseId, length]);

  /**
   * The value as of the last commit, readable synchronously.
   *
   * `onFocus` refuses focus that lands beyond the filled digits, which is what keeps the
   * code compact. It cannot read `value` to do that: moving focus in `commit` fires the
   * focus event in the same tick, before React has re-rendered, so the closure still holds
   * the *previous* value. The guard then saw an empty field, decided box 1 was out of
   * range, and pulled the caret straight back to box 0 — which is why typing a second
   * digit did nothing and the whole second-factor challenge was unusable.
   */
  const committed = useRef(value);
  useEffect(() => {
    committed.current = value;
  }, [value]);

  /**
   * One stable ref callback per box, created once per `length`.
   *
   * Identity matters here in a way it usually does not. React detaches a ref whose callback
   * changed — calling the old one with `null` before the new one with the node — so a factory
   * returning a fresh closure every render leaves `boxes.current` empty for part of every
   * commit, and the caret stops advancing as the customer types.
   */
  const boxRefs = useMemo(
    () =>
      Array.from({ length }, (_, index) => (node: HTMLInputElement | null) => {
        boxes.current[index] = node;
      }),
    [length],
  );

  /** Clamped so an off-by-one at either end is a no-op rather than a crash. */
  const focusBox = (index: number): void => {
    boxes.current[Math.min(Math.max(index, 0), length - 1)]?.focus();
  };

  /**
   * The single write path for the value.
   *
   * Normalise, store, then move the caret to the first empty box — in that order. Doing the
   * focus move here rather than in each handler is what keeps the value compact: there is no
   * route to setting a digit without the caret following it.
   */
  const commit = (next: string): void => {
    const clean = next.replaceAll(NON_DIGITS, '').slice(0, length);
    committed.current = clean;
    setValue(clean);
    focusBox(clean.length);
    if (clean.length === length) onComplete?.(clean);
  };

  return {
    value,
    cells,
    registerBox: (index) => boxRefs[index] ?? noopRef,
    onDigit: (index, raw) => commit(withDigitAt(value, index, raw)),
    onKeyDown: (index, event) => handleKeyDown({ index, event, value, setValue, focusBox }),
    onPaste: (index, event) => {
      event.preventDefault();
      commit(`${value.slice(0, index)}${event.clipboardData.getData('text')}`);
    },
    onFocus: (index) => {
      if (index > committed.current.length) focusBox(committed.current.length);
    },
  };
}

/**
 * Replaces the digit at one position.
 *
 * Takes the *last* digit of the raw input, not the first: a box that already holds a digit
 * receives `"12"` from the browser when the next key is pressed, and the newer digit is the
 * one the customer just typed. Non-digits filter to an empty string, which clears the box
 * rather than rejecting the keystroke silently.
 */
function withDigitAt(value: string, index: number, raw: string): string {
  const digit = raw.replaceAll(NON_DIGITS, '').at(-1) ?? '';
  return `${value.slice(0, index)}${digit}${value.slice(index + 1)}`;
}

/**
 * Arrow keys move the caret; backspace deletes and steps back. Extracted as a plain function
 * because none of it touches a ref or React state directly — it is a decision about which
 * digit and which box, expressed as one.
 */
function handleKeyDown(input: {
  readonly index: number;
  readonly event: KeyboardEvent<HTMLInputElement>;
  readonly value: string;
  readonly setValue: (next: string) => void;
  readonly focusBox: (index: number) => void;
}): void {
  const { index, event, value, setValue, focusBox } = input;

  const step = ARROW_STEP[event.key];
  if (step !== undefined) {
    event.preventDefault();
    focusBox(index + step);
    return;
  }

  if (event.key !== BACKSPACE) return;

  event.preventDefault();
  const next = afterBackspace(value, index);
  setValue(next.value);
  focusBox(next.focus);
}
