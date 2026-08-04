/**
 * Health, readiness, metrics and the OpenAPI document.
 *
 * These four are the only routes in the client that do not answer with the contract's
 * `{ data }` envelope, because none of them is consumed by a front end: probes, scrapers
 * and documentation tooling all expect their own conventional formats.
 */

import { routes } from '@reliance/contracts';

import type { ResolvedConfig } from '../core/config.js';
import { joinUrl } from '../core/query.js';
import type { HttpTransport } from '../core/transport.js';
import type { QueryOptions } from '../core/types.js';
import { healthSchema, type Health } from '../provisional/operations.js';

/** Builds the `client.system` group. */
export function createSystemResource(http: HttpTransport, config: ResolvedConfig) {
  return {
    /** Liveness. Answers while the process is up, whatever its dependencies are doing. */
    health: (options?: QueryOptions): Promise<Health> =>
      http.get({ ...options, path: routes.system.health, schema: healthSchema }),

    /** Readiness. Fails when a dependency the bank cannot serve without is down. */
    ready: (options?: QueryOptions): Promise<Health> =>
      http.get({ ...options, path: routes.system.ready, schema: healthSchema }),

    /**
     * Prometheus exposition text.
     *
     * Returned as a string: there is no schema because the format is line-oriented text,
     * and parsing it into an object here would only make a scraper undo the work.
     */
    metrics: (options?: QueryOptions): Promise<string> =>
      http.get({ ...options, path: routes.system.metrics }),

    /** URL of the OpenAPI document. */
    docsUrl: (): string => joinUrl(config.baseUrl, `${config.prefix}${routes.system.docs}`),
  };
}

/** The `client.system` group. */
export type SystemResource = ReturnType<typeof createSystemResource>;
