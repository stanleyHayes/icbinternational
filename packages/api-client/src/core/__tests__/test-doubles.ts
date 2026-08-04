/**
 * Shared fakes for the transport tests.
 *
 * A scripted `fetch` rather than a mocked one: the refresh tests care about the *order*
 * calls arrive in and how many of them there are, and a queue of scripted responses
 * makes both assertable without reaching into mock internals.
 */

import type { FetchLike } from '../config.js';
import { CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE } from '../http.js';

/** One recorded call. */
export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

/** A response the script should return. */
export interface ScriptedResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export interface ScriptedFetch {
  readonly fetch: FetchLike;
  readonly calls: RecordedCall[];
  /** Calls whose path ends with the refresh route. */
  refreshCalls(): RecordedCall[];
}

function toResponse(scripted: ScriptedResponse): Response {
  const headers = new Headers({
    [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE,
    ...scripted.headers,
  });
  const body = scripted.body === undefined ? '' : JSON.stringify(scripted.body);
  return new Response(body, { status: scripted.status, headers });
}

/**
 * Builds a fetch that answers from `handler`, recording every call.
 *
 * The handler receives the call index so a test can say "the first attempt 401s, the
 * second succeeds" without any shared mutable counter of its own.
 */
export function scriptedFetch(
  handler: (call: RecordedCall, index: number) => ScriptedResponse | Promise<ScriptedResponse>,
): ScriptedFetch {
  const calls: RecordedCall[] = [];

  const fetch: FetchLike = async (url, init) => {
    const record: RecordedCall = {
      url,
      method: init.method ?? 'GET',
      headers: headersToRecord(init.headers),
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    calls.push(record);
    return toResponse(await handler(record, calls.length - 1));
  };

  return {
    fetch,
    calls,
    refreshCalls: () => calls.filter((call) => call.url.includes('/auth/refresh')),
  };
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

/** A deferred promise, for holding a refresh open while other requests pile up. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
