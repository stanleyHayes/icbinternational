/**
 * Every in-app destination, named once.
 *
 * `typedRoutes` is on, so `Route` narrows to the set of routes that exist the moment Next has
 * generated its types. The signed-in area is built by a separate lane, which means the shell has
 * to link to destinations that are not on disk while it is being written. `appRoute` is the single
 * place that admits that: one cast, documented, rather than a cast at every `<Link>`.
 */

import type { Route } from 'next';

/**
 * Marks a path as an application route.
 *
 * Not a validation — it is an assertion that the path will exist. Adding a destination here that
 * nothing serves produces a 404, exactly as a mistyped string literal would.
 */
function appRoute(path: string): Route {
  return path as Route;
}

/** Routes served by the authentication and onboarding lane (this workstream). */
export const authRoutes = {
  signIn: appRoute('/sign-in'),
  twoFactor: appRoute('/sign-in/two-factor'),
  register: appRoute('/register'),
  verifyEmail: appRoute('/verify-email'),
  verifyPhone: appRoute('/verify-phone'),
  forgotPassword: appRoute('/forgot-password'),
  resetPassword: appRoute('/reset-password'),
  accountLocked: appRoute('/account-locked'),
} as const;

/** Routes served by the onboarding wizard (this workstream). */
export const onboardingRoutes = {
  start: appRoute('/onboarding'),
  status: appRoute('/onboarding/status'),
  /** @param slug a wizard step slug from `lib/kyc-steps.ts`, e.g. `source-of-funds`. */
  step: (slug: string): Route => appRoute(`/onboarding/${slug}`),
} as const;

/**
 * Routes served by the signed-in application lane.
 *
 * The shell's navigation, command palette and post-sign-in redirect all resolve through this
 * object, so the feature lane can move a destination by changing one line here.
 */
export const appRoutes = {
  dashboard: appRoute('/dashboard'),
  accounts: appRoute('/accounts'),
  payments: appRoute('/payments'),
  transfers: appRoute('/transfers'),
  payees: appRoute('/payees'),
  cards: appRoute('/cards'),
  save: appRoute('/save'),
  borrow: appRoute('/borrow'),
  insights: appRoute('/insights'),
  support: appRoute('/support'),
  notifications: appRoute('/notifications'),
  settings: appRoute('/settings'),
  settingsSecurity: appRoute('/settings/security'),
} as const;

/** Query parameter carrying the destination a signed-out visitor was trying to reach. */
export const RETURN_TO_PARAM = 'next';

/** Query parameter explaining why the customer is looking at the sign-in screen. */
export const REASON_PARAM = 'reason';

/** Reasons the sign-in screen knows how to explain. */
export const SignInReason = {
  /** The session ended while the customer was using the app. */
  EXPIRED: 'expired',
  /** The customer signed out deliberately. */
  SIGNED_OUT: 'signed-out',
  /** The password was just changed, so every session was revoked. */
  CREDENTIALS_UPDATED: 'credentials-updated',
} as const;
/** A reason the sign-in screen can explain. */
export type SignInReason = (typeof SignInReason)[keyof typeof SignInReason];

/** Paths that may be used as a post-sign-in destination. */
const SAFE_DESTINATION = /^\/(?!\/)[\w\-./]*$/;

/**
 * Narrows an untrusted `?next=` value to a same-origin path.
 *
 * Anything absolute, protocol-relative or containing a traversal segment is discarded in favour of
 * the dashboard. An open redirect on a bank's sign-in page is a phishing kit with the bank's own
 * domain in the address bar.
 */
export function safeDestination(candidate: string | null | undefined): Route {
  if (!candidate || !SAFE_DESTINATION.test(candidate) || candidate.includes('..')) {
    return appRoutes.dashboard;
  }
  return appRoute(candidate);
}

/** Appends the return-to parameter to any route that needs to hand the customer onwards. */
export function withReturn(route: Route, destination: string): Route {
  const query = new URLSearchParams({ [RETURN_TO_PARAM]: destination });
  return appRoute(`${route}?${query.toString()}`);
}

/**
 * Builds the sign-in URL, carrying the destination the visitor was trying to reach.
 *
 * @param destination the path to return to once signed in. Ignored when it is sign-in itself.
 * @param reason why the customer is being sent here, so the screen can say so.
 */
export function signInWithReturn(destination?: string | null, reason?: SignInReason): Route {
  const query = new URLSearchParams();
  if (destination && destination !== authRoutes.signIn) query.set(RETURN_TO_PARAM, destination);
  if (reason) query.set(REASON_PARAM, reason);
  const search = query.toString();
  return search ? appRoute(`${authRoutes.signIn}?${search}`) : authRoutes.signIn;
}
