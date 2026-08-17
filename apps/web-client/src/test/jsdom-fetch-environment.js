/**
 * `jsdom` with Node's fetch family added.
 *
 * jsdom implements the DOM but not `fetch`, `Request`, `Response` or `Headers`, and MSW's
 * request interception cannot start without them. Environment modules load in Jest's own
 * realm, where Node has already provided all four — so the fix is to hand the sandboxed
 * global the real implementations rather than to polyfill anything.
 *
 * Opt in per test file with a docblock, so suites that never touch the network are
 * unaffected:
 *
 * ```ts
 * /**
 *  * @jest-environment ./src/test/jsdom-fetch-environment
 *  *\/
 * ```
 */

/* eslint-disable no-restricted-syntax, @typescript-eslint/no-require-imports --
   Jest loads custom environments with `require()`; this module must stay CommonJS. */

const { ReadableStream, TransformStream, WritableStream } = require('node:stream/web');
const { TextDecoder, TextEncoder } = require('node:util');

const { TestEnvironment } = require('jest-environment-jsdom');

class JSDOMFetchEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);

    this.global.fetch = fetch;
    this.global.Request = Request;
    this.global.Response = Response;
    this.global.Headers = Headers;
    // Abort signals built in the sandbox must be Node's own: undici's `fetch` (installed
    // above) rejects or strands a foreign-realm signal, and React Query threads one
    // through every request. A query that never settles reads as a broken screen.
    this.global.AbortController = AbortController;
    this.global.AbortSignal = AbortSignal;
    // MSW's WebSocket client store reaches for these at import time.
    this.global.BroadcastChannel = BroadcastChannel;
    this.global.ReadableStream = ReadableStream;
    this.global.WritableStream = WritableStream;
    this.global.TransformStream = TransformStream;
    this.global.TextEncoder = TextEncoder;
    this.global.TextDecoder = TextDecoder;
  }
}

module.exports = JSDOMFetchEnvironment;
