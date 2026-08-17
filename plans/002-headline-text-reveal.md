# 002 — Headline text reveal on hero and page headers

- **Status**: DONE
- **Commit**: 962dcf6
- **Severity**: LOW
- **Category**: 8 — Missed opportunities
- **Estimated scope**: 1 new file + 2 edited components in `apps/web-marketing`

## Problem

The two most-read texts on the site — the homepage hero headline (`apps/web-marketing/src/components/marketing/home-hero.tsx:34`) and every page's `<h1>` (`apps/web-marketing/src/components/marketing/page-header.tsx:60`) — appear instantly on load. These are once-per-visit, high-emotion surfaces; they carry the site's whole first impression with zero of the motion budget they're allowed.

## Target

A masked line-by-line reveal on mount:

- Split the headline by its existing line structure (do NOT reflow or reword the copy — split on explicit children/lines as authored, never auto-split words mid-string).
- Each line is wrapped in an overflow-hidden mask; the text starts at `transform: translateY(110%)` (percentage of the element's own height — no hardcoded pixels) and slides to `translateY(0)`.
- Transition: `transform 640ms cubic-bezier(0.23, 1, 0.32, 1)` with a **70ms stagger** between lines; supporting copy (description/eyebrow) fades with `opacity 420ms` after the last line starts.
- `prefers-reduced-motion: reduce`: text renders in final position immediately — this is first paint, so reduced motion means no animation at all, not an opacity-only compromise.
- SSR/no-JS safe: initial hidden state applied from `useEffect`, never in server HTML.

## Repo conventions to follow

- Headings are composed ad hoc from utilities (the marketing app does not use `TEXT_STYLE`): keep the exact class strings in `home-hero.tsx:34` and `page-header.tsx:60` unchanged; the reveal is a wrapper, not a restyle.
- Easing token `--rb-ease-emphasized: cubic-bezier(0.23, 1, 0.32, 1)` is added to `apps/web-marketing/src/app/globals.css` by plan 001 — reuse it.
- Reduced-motion blanket clamp exists at `apps/web-marketing/src/app/globals.css:116-128`; the component must still do its own matchMedia check so it never sets the hidden initial state under reduced motion.

## Steps

1. Create `apps/web-marketing/src/components/motion/text-reveal.tsx` (`'use client'`):
   - Props: `lines: ReactNode[]` (rendered in order), `className`, `lineClassName`.
   - Render each line as `<span style={{ display: 'block', overflow: 'hidden' }}><span style={{ display: 'block', transform, transition, transitionDelay: \`${i * 70}ms\` }}>{line}</span></span>`.
   - `useEffect` flips `visible` on mount (rAF or zero-timeout so the transition actually runs); reduced-motion check skips hiding.
2. `apps/web-marketing/src/components/marketing/home-hero.tsx`: wrap the h1 content in `TextReveal` (split the authored headline into its natural lines as separate ReactNodes), and fade the supporting paragraph/CTA block with `opacity 420ms var(--rb-ease-decelerate)` starting after `lines.length * 70ms`.
3. `apps/web-marketing/src/components/marketing/page-header.tsx`: same treatment for the h1 and the description paragraph. Breadcrumbs stay static (they're navigation, seen constantly).
4. Add `apps/web-marketing/src/components/motion/text-reveal.test.tsx`: lines render, start translated under mocked matchMedia(no-preference), and render static under reduced motion.

## Boundaries

- Do NOT change any words, heading levels, or class strings on the headings.
- Do NOT animate body copy, tables, FAQs, or forms — headlines and their immediate lede only.
- No dependencies. `transform`/`opacity` only.
- If a step doesn't match the code you find (drift since commit 962dcf6), STOP and report.

## Verification

- **Mechanical**: marketing `test`, `typecheck`, `lint`, `build` all green.
- **Feel check**: reload the homepage and `/savings` several times:
  - the headline arrives as lines sliding up out of their masks, ~70ms apart, easing hard at the end — no fade-only, no whole-block rise;
  - in the DevTools Animations panel at 10% speed, each line's text is clipped by its mask for the whole transition;
  - with reduced-motion emulated, the full headline is present on first paint with no motion.
- **Done when**: hero + page-header headlines reveal per spec, all checks green.
