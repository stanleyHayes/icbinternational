# 001 — Scroll-reveal system for marketing sections

- **Status**: DONE
- **Commit**: 962dcf6
- **Severity**: MEDIUM
- **Category**: 8 — Missed opportunities
- **Estimated scope**: ~3 new/changed files in `apps/web-marketing`, no dependency additions

## Problem

Every marketing page renders its full content statically: sections, cards, testimonials and CTAs teleport into view as the user scrolls. There is zero scroll-driven motion in the app — no `IntersectionObserver`, no `useInView`, nothing (verified: grep across `apps/web-marketing/src`). A bank's marketing site should feel composed, not printed.

## Target

A reusable, reduced-motion-safe scroll-reveal wrapper used by the shared marketing building blocks:

- Elements start at `opacity: 0; transform: translateY(1rem)` and animate to `opacity: 1; transform: translateY(0)` when they enter the viewport (once — no re-triggering on scroll up).
- Transition (not keyframes): `transform 480ms cubic-bezier(0.23, 1, 0.32, 1), opacity 480ms cubic-bezier(0.23, 1, 0.32, 1)` — strong ease-out, entrances start fast.
- Sibling groups (grids, card rows) stagger at **60ms** per item (inside the 30–80ms band), decorative only — never blocking interaction.
- `@media (prefers-reduced-motion: reduce)`: elements render fully visible with no transform and no transition (final state, not an opacity-only animation — this is first paint, not feedback).
- `transform` and `opacity` only — no layout-property animation.
- Content must be visible if JS never runs (server-rendered pages): the hidden initial state is applied by JS on mount, not by default CSS, so no-JS and pre-hydration renders show everything.

## Repo conventions to follow

- Durations/easings come from the existing tokens in `packages/ui/src/styles/theme.css:80-86` (`--rb-duration-*`, `--rb-ease-*`); the strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)` is not among them, so add it as `--rb-ease-emphasized` in `apps/web-marketing/src/app/globals.css` (do NOT edit `packages/ui/src/styles/*.css` — they are generated from `brand/tokens/brand.tokens.json`).
- Existing mount-animation idiom to imitate for reduced-motion gating: `motion-safe:animate-slide-up` in `apps/web-marketing/src/components/layout/cookie-banner.tsx:90`.
- Client islands are normal here (`apps/web-marketing/src/components/layout/site-header.tsx` etc.) — one new `'use client'` component is consistent with the codebase.

## Steps

1. Add to `apps/web-marketing/src/app/globals.css`: `:root { --rb-ease-emphasized: cubic-bezier(0.23, 1, 0.32, 1); }` beside the existing custom properties.
2. Create `apps/web-marketing/src/components/motion/reveal.tsx` (`'use client'`):
   - Props: `children`, `as` (tag, default `'div'`), `className`, `delay` (ms, default 0).
   - `useRef` + `useEffect` with one `IntersectionObserver` (`threshold: 0.15`, `rootMargin: '0px 0px -8% 0px'`); on first intersection set a `visible` state and disconnect.
   - Before first observation applies, add the initial hidden styles inline from the effect (so SSR HTML is fully visible); render with `style={{ transition: 'transform 480ms var(--rb-ease-emphasized), opacity 480ms var(--rb-ease-emphasized)', transitionDelay: \`${delay}ms\`, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(1rem)' }}`.
   - Under `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, skip hiding entirely (render visible, no transition).
3. Create `apps/web-marketing/src/components/motion/reveal-group.tsx` (`'use client'`): clones/wraps each child in `Reveal` with `delay: index * 60`.
4. Wire into the shared building blocks (each is a server component — wrapping with a client component is fine):
   - `apps/web-marketing/src/components/marketing/section.tsx` — wrap `SectionHeading` content in `Reveal`.
   - `apps/web-marketing/src/components/marketing/feature-grid.tsx` — items via `RevealGroup`.
   - `apps/web-marketing/src/components/marketing/product-showcase.tsx` — cards via `RevealGroup`.
   - `apps/web-marketing/src/components/marketing/testimonials.tsx` — cards via `RevealGroup`.
   - `apps/web-marketing/src/components/marketing/cta-band.tsx` — content in `Reveal`.
   - `apps/web-marketing/src/components/marketing/trust-band.tsx` — items via `RevealGroup`.
5. Add `apps/web-marketing/src/components/motion/reveal.test.tsx`: jsdom test with a mocked `IntersectionObserver` asserting hidden-then-visible behavior and the stagger delays, plus reduced-motion rendering visible.

## Boundaries

- Do NOT touch `packages/ui` source or generated CSS, `apps/web-client`, `apps/web-admin`, or the chat widget.
- Do NOT change markup structure or copy — motion wrappers only.
- Do NOT add dependencies (no framer-motion/GSAP).
- Header, mobile nav, mega menu and cookie banner are out of scope (covered elsewhere / deliberate).
- If a step doesn't match the code you find (drift since commit 962dcf6), STOP and report.

## Verification

- **Mechanical**: `pnpm --filter @reliance/web-marketing test`, `pnpm --filter @reliance/web-marketing typecheck`, `pnpm --filter @reliance/web-marketing lint` — all green. `pnpm --filter @reliance/web-marketing build` succeeds.
- **Feel check**: run the marketing site, scroll the homepage slowly:
  - each section heading rises and settles before the grid below it follows in a 60ms cascade;
  - scrolling back up does not re-run anything;
  - in DevTools Rendering panel, enable "Emulate CSS media feature prefers-reduced-motion: reduce" and reload — every section is simply there, nothing hidden, nothing moving;
  - disable JS and reload — all content visible.
- **Done when**: homepage + one product page reveal on scroll with staggered groups, reduced-motion is a no-op, and tests/lint/typecheck/build pass.
