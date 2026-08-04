import { createSeededFaker, DEFAULT_TEST_SEED, testFaker } from '../seeded-faker.js';

describe('seeded faker', () => {
  it('reproduces the same sequence for the same seed', () => {
    const first = createSeededFaker(42);
    const second = createSeededFaker(42);

    expect(first.person.fullName()).toBe(second.person.fullName());
    expect(first.internet.email()).toBe(second.internet.email());
  });

  it('produces different sequences for different seeds', () => {
    const first = createSeededFaker(1);
    const second = createSeededFaker(2);

    expect(first.person.fullName()).not.toBe(second.person.fullName());
  });

  it('defaults to the repo-wide seed', () => {
    const defaulted = createSeededFaker();
    const explicit = createSeededFaker(DEFAULT_TEST_SEED);

    expect(defaulted.person.fullName()).toBe(explicit.person.fullName());
  });

  it('exposes a pre-seeded shared instance', () => {
    expect(testFaker.person.firstName()).toEqual(expect.any(String));
  });

  it('generates GB-flavoured data', () => {
    const faker = createSeededFaker(7);

    // en_GB postcode formats, e.g. "M1 2AB" — the generic `en` locale does not
    // produce these.
    expect(faker.location.zipCode()).toMatch(/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/);
  });
});
