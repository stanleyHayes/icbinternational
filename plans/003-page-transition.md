# 003 — Page transition on route change

- **Status**: DONE
- **Commit**: 962dcf6
- **Severity**: MEDIUM
- **Category**: 8 — Missed opportunities
- **Estimated scope**: 1 new file + 1 small edit in `apps/web-marketing`

## Problem

Navigating between marketing pages is a hard cut: the next page's content appears in place of the last with no transition. `apps/web-marketing/src/app/layout.tsx` renders `<main>{children}</main>` with nothing between routes, so every navigation is a jarring swap on a content-heavy site.

## Target

A route-level enter transition via Next.js App Router's `template.tsx` (a template remounts on navigation, which is exactly the per-navigation mount hook this needs):

- On each navigation, page content enters with `opacity 0 → 1` and `transform: translateY(0.5rem) → none`.
- Duration **240ms** (`var(--rb-duration-base)` — UI-scale, this fires on every navigation so it must stay under 300ms), easing `cubic-bezier(0.23, 1, 0.32, 1)` (`var(--rb-ease-emphasized)`, added by plan 001) — a transition or a one-shot keyframe is acceptable here because it cannot be interrupted (the browser commits the navigation once).
- No exit animation (App Router cannot delay the outgoing tree without a frozen-Router hack — out of scope; an enter-only transition is the correct trade).
- `prefers-reduced-motion: reduce`: no animation, content appears immediately. The existing blanket clamp in `globals.css:116-128` already collapses token durations, but the rule for this element must also drop the transform.
- `transform` + `opacity` only.

## Repo conventions to follow

- The app already keys nav remounts per route (`apps/web-marketing/src/components/layout/site-header.tsx:24`, `key={pathname}`) — per-route remount motion is an established pattern here.
- Existing entrance idiom: `motion-safe:animate-slide-up` (`cookie-banner.tsx:90`), which maps to keyframes `rb-slide-up` in `packages/ui/src/styles/tailwind-theme.css:119-127` — reuse `animate-slide-up` (240ms, decelerate, translateY(0.5rem)) rather than adding a second near-identical keyframe.

## Steps

1. Create `apps/web-marketing/src/app/template.tsx`:
   ```tsx
   export default function Template({ children }: { children: React.ReactNode }) {
     return <div className="motion-safe:animate-slide-up">{children}</div>;
   }
   ```
   (If `--rb-ease-emphasized` from plan 001 is preferred over `--rb-ease-decelerate`, define a local `--animate-page-enter: rb-slide-up var(--rb-duration-base) var(--rb-ease-emphasized)` in `globals.css` `@theme` and use `motion-safe:animate-page-enter` instead — pick one, keep it token-based.)
2. Verify no layout shift: the wrapper must not add margin/padding/max-width — it is a motion-only boundary.
3. Check `apps/web-marketing/src/app/(…)` route groups: if any nested `template.tsx` already exists, leave it; otherwise the root template covers all pages.
4. Extend an existing layout test or add `apps/web-marketing/src/app/template.test.tsx`: renders children inside the animated wrapper.

## Boundaries

- Do NOT attempt exit transitions, route freezing, or `useRouter` interception.
- Do NOT touch the site header/footer (persistent chrome should NOT re-animate — the template wraps only `{children}` of the page, which is exactly the boundary layout.tsx already draws).
- No dependencies.
- If a step doesn't match the code you find (drift since commit 962dcf6), STOP and report.

## Verification

- **Mechanical**: marketing `test`, `typecheck`, `lint`, `build` all green.
- **Feel check**: click between `/`, `/savings`, `/help`, `/personal/current-accounts`:
  - each page's content rises ~8px and fades in within a quarter second; the header and footer do not move or re-animate;
  - rapid back/forward navigation never stacks or stutters;
  - with reduced-motion emulated, navigation is an instant (plain) swap.
- **Done when**: every route change enters with the transition, chrome stays still, checks green.
