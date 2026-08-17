# Animation plans — apps/web-marketing

Audit of `apps/web-marketing` at commit `962dcf6`: the site has hover/focus CSS transitions and
three mount-only entrances (mega-menu, cookie banner, chat panel), but zero scroll-driven,
text-level, or page-level motion. These three plans add exactly those, in dependency order.

| #   | Title                                    | Severity | Status |
| --- | ---------------------------------------- | -------- | ------ |
| 001 | Scroll-reveal system for sections        | MEDIUM   | DONE   |
| 002 | Headline text reveal (hero + page heads) | LOW      | DONE   |
| 003 | Page transition on route change          | MEDIUM   | DONE   |

## Execution order

1. **001 first** — it adds the `--rb-ease-emphasized` token and the `components/motion/`
   directory that 002 and 003 build on.
2. 002 and 003 are independent of each other; either order after 001.

## Shared constraints (all plans)

- No new dependencies; `transform`/`opacity` only; SSR/no-JS safe (hidden state applied by
  JS, never in server HTML); `prefers-reduced-motion` renders final state immediately.
- Do not edit `packages/ui` generated CSS — new tokens live in
  `apps/web-marketing/src/app/globals.css`.
