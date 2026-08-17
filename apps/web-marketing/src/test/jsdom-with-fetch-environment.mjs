/**
 * jsdom, plus Node's fetch globals.
 *
 * `jest-environment-jsdom` builds the test realm from a jsdom window, which has no `fetch`,
 * `Request`, `Response` or `Headers` — and MSW reaches for them at import time, so a suite
 * that drives screens against `@reliance/mocks/server` dies before its first test. The
 * environment class itself loads in Jest's own Node realm, where those globals exist, so
 * `setup()` copies across whatever the sandbox is missing. Same trick as the
 * `jest-fixed-jsdom` package, without taking a dependency for twenty lines.
 *
 * Opt in per file with a docblock: `@jest-environment ./src/test/jsdom-with-fetch-environment.mjs`.
 */

import JestEnvironmentJsdom from 'jest-environment-jsdom';

const EnvironmentClass = JestEnvironmentJsdom.default ?? JestEnvironmentJsdom;

/** Globals the fetch stack and MSW touch. Copied only when the sandbox lacks them. */
const FETCH_GLOBALS = [
  'fetch',
  'Request',
  'Response',
  'Headers',
  'FormData',
  'Blob',
  'File',
  'structuredClone',
  'crypto',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'TextEncoder',
  'TextDecoder',
  'BroadcastChannel',
];

export default class JsdomWithFetchEnvironment extends EnvironmentClass {
  async setup() {
    await super.setup();
    for (const name of FETCH_GLOBALS) {
      if (this.global[name] === undefined && globalThis[name] !== undefined) {
        this.global[name] = globalThis[name];
      }
    }
  }
}
