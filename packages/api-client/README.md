# `@reliance/api-client`

A typed `fetch` client for the Reliance Bank API, generated against the frozen contract in
`@reliance/contracts`.

```ts
import { createApiClient, ApiClientError, withIdempotencyKey } from '@reliance/api-client';

const client = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL });

const { data: accounts } = await client.accounts.list();
const { data: balance } = await client.accounts.balance(accounts[0].id);
```

## The three behaviours worth knowing

**Cookies carry the session.** Every request sends `credentials: 'include'` and echoes the readable
`rb.csrf` cookie in the `x-csrf-token` header on mutations. Nothing in this package reads, stores or
returns an access token — they are httpOnly and invisible to script, which is the point.

**A 401 refreshes once, across all concurrent requests.** Twelve widgets mounting at once produce
twelve 401s and exactly _one_ refresh, then twelve retries. Firing twelve refreshes would present an
already-rotated refresh token eleven times, the API would read that as `TOKEN_REUSE_DETECTED`, and
the user would be logged out by their own dashboard loading. A second 401 propagates and
`onUnauthenticated` fires.

**Responses are validated against the contract outside production.** Contract drift fails loudly in
development, as an `INTERNAL_ERROR` naming the field that drifted, and costs nothing in the browser.
Override with `validateResponses`.

## Errors

Every rejection is an `ApiClientError`. Switch on `code`, never on `message`:

```ts
try {
  await client.transfers.create({ quoteId }, withIdempotencyKey());
} catch (error) {
  if (!ApiClientError.isApiClientError(error)) throw error;

  if (error.is('INSUFFICIENT_FUNDS')) return showTopUpPrompt();
  if (error.is('STEP_UP_REQUIRED')) return promptForStepUp();
  if (error.isTransportFailure) return showOfflineBanner();

  reportToSentry({ code: error.code, traceId: error.traceId });
}
```

`error.traceId` correlates the failure with server logs — put it in every bug report.

## Idempotency

Mint one key per _user intention_, not per HTTP attempt, and reuse it across retries:

```ts
const send = withIdempotencyKey(); // once, when the user presses Send
await client.transfers.create(body, send); // times out
await client.transfers.create(body, send); // safe: the API deduplicates
```

Money-moving methods mint a key when you do not supply one, which makes a single call safe. It does
**not** make your retry safe — only reusing the same key does.

## Step-up authentication

`client.cards.sensitiveDetails(id, token)` takes the token as a required argument rather than an
option, so the one call in this client that returns a PAN cannot be reached without
re-authenticating first.

```ts
const { data: grant } = await client.auth.stepUp({ method: 'TOTP', credential: code });
const details = await client.cards.sensitiveDetails(cardId, grant.token);
```

## Server-side rendering

Supply the incoming cookie header, since there is no `document` to read:

```ts
const client = createApiClient({
  baseUrl: process.env.API_URL,
  cookieReader: cookieHeaderReader(headers().get('cookie') ?? ''),
  defaultHeaders: { cookie: headers().get('cookie') ?? '' },
});
```

## Provisional schemas

A handful of routes in the contract's `routes` map have no response schema anywhere in
`@reliance/contracts`. `src/provisional/` fills those gaps so this client can type them and
`@reliance/mocks` can generate them from the _same_ definition. They are listed in
`docs/CONTRACT_CHANGES.md` and are deleted, not deprecated, when the real schema lands.
