import { hashRequest } from '../request-hash.js';

const BASE = { method: 'POST', path: '/v1/transfers/internal', body: { amount: '10000' } };

describe('hashRequest', () => {
  it('is stable across calls', () => {
    expect(hashRequest(BASE)).toBe(hashRequest(BASE));
  });

  it('ignores key order in the body', () => {
    const a = hashRequest({ ...BASE, body: { amount: '1', currency: 'GBP' } });
    const b = hashRequest({ ...BASE, body: { currency: 'GBP', amount: '1' } });

    // A client re-serialising its retry from an object literal can emit a different key
    // order for the same payload. Treating that as a reused key would be maddening.
    expect(a).toBe(b);
  });

  it('is case-insensitive on the method', () => {
    expect(hashRequest({ ...BASE, method: 'post' })).toBe(hashRequest({ ...BASE, method: 'POST' }));
  });

  it('changes when the amount changes', () => {
    expect(hashRequest({ ...BASE, body: { amount: '10001' } })).not.toBe(hashRequest(BASE));
  });

  it('changes when the path changes', () => {
    // Two endpoints with identical bodies are different operations and must never answer
    // each other's replays.
    expect(hashRequest({ ...BASE, path: '/v1/payments' })).not.toBe(hashRequest(BASE));
  });

  it('distinguishes an absent body from an empty one', () => {
    expect(hashRequest({ ...BASE, body: undefined })).not.toBe(hashRequest({ ...BASE, body: {} }));
  });

  it('treats an undefined body and a null body alike', () => {
    expect(hashRequest({ ...BASE, body: undefined })).toBe(hashRequest({ ...BASE, body: null }));
  });
});
