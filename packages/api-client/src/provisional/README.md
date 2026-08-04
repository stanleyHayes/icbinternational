# Provisional schemas

`@reliance/contracts` is frozen, and a handful of routes in its own `routes` map have no response
schema anywhere in the package. This directory holds the missing shapes so that
`@reliance/api-client` can type them and `@reliance/mocks` can generate them **from one definition
rather than two**.

These are not a fork of the contract. Each schema here is a candidate for promotion into
`packages/contracts/src/modules/*` the moment the lane that owns the endpoint lands; the gap is
recorded in `docs/CONTRACT_CHANGES.md`.

Rules for anything added here:

- It must correspond to a route that already exists in `routes`. Inventing endpoints is not what
  this directory is for.
- It must be exported from `provisional/index.ts` so `@reliance/mocks` consumes exactly the same
  object the client validates against.
- It must be deleted, not merely deprecated, when the real contract schema arrives.
