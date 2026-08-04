import { AppConfigService } from '../../../config/config.service.js';
import { PasswordService } from '../password.service.js';

import { testConfig } from './test-environment.js';

/**
 * The test configuration deliberately uses the cheapest Argon2 parameters the library
 * accepts — the algorithm is real, the cost is not what production pays.
 */
function makeService(): PasswordService {
  return new PasswordService(new AppConfigService(testConfig()));
}

jest.setTimeout(120_000);

describe('PasswordService', () => {
  it('round-trips a hash and verification', async () => {
    const service = makeService();
    const digest = await service.hash('Correct-Horse-Battery-1');

    expect(digest).toContain('$argon2id$');
    await expect(service.verify(digest, 'Correct-Horse-Battery-1')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const service = makeService();
    const digest = await service.hash('Correct-Horse-Battery-1');

    await expect(service.verify(digest, 'Wrong-Horse-Battery-1')).resolves.toBe(false);
  });

  it('treats a malformed digest as a failed verification, never a thrown secret', async () => {
    const service = makeService();

    await expect(service.verify('not-a-digest', 'anything')).resolves.toBe(false);
  });

  it('burns CPU on the decoy and always fails', async () => {
    const service = makeService();
    await service.onModuleInit();

    await expect(service.verifyAgainstDecoy('anything')).resolves.toBe(false);
  });

  it('flags digests produced under weaker parameters for upgrade', async () => {
    const service = makeService();
    const weak = await service.hash('Correct-Horse-Battery-1');
    const stronger = new PasswordService(
      new AppConfigService({ ...testConfig(), ARGON2_TIME_COST: 2 }),
    );

    expect(stronger.needsUpgrade(weak)).toBe(true);
    expect(service.needsUpgrade(weak)).toBe(false);
  });
});
