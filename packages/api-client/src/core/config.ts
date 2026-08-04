/**
 * Client configuration and its defaults.
 *
 * Everything environment-dependent is injected rather than sniffed at the call site, so
 * the same client construction works in a browser, in a Next.js server component and in
 * a Jest test without any of them needing to know about the others.
 */

import { API_PREFIX } from '@reliance/contracts';

import { documentCookieReader, type CookieReader } from './cookies.js';

/** The `fetch` implementation, narrowed to what the transport actually calls. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientConfig {
  /**
   * Origin of the API, without the version segment — e.g. `https://api.reliance.bank`.
   * An empty string targets the current origin, which is what a browser app wants when
   * the API is proxied under the same domain.
   */
  readonly baseUrl?: string;
  /** Version prefix. Defaults to the contract's `API_PREFIX`. */
  readonly prefix?: string;
  /** Injected for tests and for server runtimes that supply their own fetch. */
  readonly fetch?: FetchLike;
  /** How the CSRF token is read. Defaults to `document.cookie`. */
  readonly cookieReader?: CookieReader;
  /** Headers merged into every request — a locale, or an SSR-forwarded cookie header. */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /**
   * Validate responses against the contract schema. Defaults to on outside production:
   * the check is what turns silent contract drift into a loud failure during
   * development, and it is not worth paying for on every hot-path response in the
   * browser once the shapes have been proven.
   */
  readonly validateResponses?: boolean;
  /**
   * Called when a 401 survives a refresh attempt. The app uses it to clear its user
   * state and route to the login screen — the client itself has no opinion about that.
   */
  readonly onUnauthenticated?: () => void;
}

/** Config with every optional member resolved. */
export interface ResolvedConfig {
  readonly baseUrl: string;
  readonly prefix: string;
  readonly fetch: FetchLike;
  readonly cookieReader: CookieReader;
  readonly defaultHeaders: Readonly<Record<string, string>>;
  readonly validateResponses: boolean;
  readonly onUnauthenticated: (() => void) | null;
}

/**
 * True unless `NODE_ENV` says production.
 *
 * Guarded because `process` is not defined in every browser bundle; an undefined
 * `NODE_ENV` is treated as development, which errs towards catching drift rather than
 * hiding it.
 */
function isDevelopmentEnvironment(): boolean {
  const env = globalThis.process?.env?.NODE_ENV;
  return env !== 'production';
}

function defaultFetch(): FetchLike {
  const implementation = globalThis.fetch;
  if (typeof implementation !== 'function') {
    throw new TypeError(
      'No global fetch is available. Pass `fetch` explicitly when creating the client.',
    );
  }
  return (input, init) => implementation(input, init);
}

/** Fills in every default. Called once, when the client is created. */
export function resolveConfig(config: ApiClientConfig = {}): ResolvedConfig {
  return {
    baseUrl: config.baseUrl ?? '',
    prefix: config.prefix ?? API_PREFIX,
    fetch: config.fetch ?? defaultFetch(),
    cookieReader: config.cookieReader ?? documentCookieReader,
    defaultHeaders: config.defaultHeaders ?? {},
    validateResponses: config.validateResponses ?? isDevelopmentEnvironment(),
    onUnauthenticated: config.onUnauthenticated ?? null,
  };
}
