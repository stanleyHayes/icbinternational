import { generate } from 'otplib';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigService } from '../../../config/config.service.js';
import { testConfig } from '../../auth/__tests__/test-environment.js';
import { SecretCipher } from '../../auth/support/secret-cipher.js';
import { TotpService } from '../totp.service.js';

const FROZEN = new Date('2026-02-01T12:00:00.000Z');
const MILLISECONDS_PER_SECOND = 1000;

function frozenClock(): ClockService {
  const clock = new ClockService();
  clock.freezeAt(FROZEN);
  return clock;
}

function buildService(clock: ClockService): TotpService {
  const config = new AppConfigService(testConfig());
  return new TotpService(new SecretCipher(config), clock, config);
}

async function codeFor(secret: string): Promise<string> {
  return generate({ secret, epoch: Math.floor(FROZEN.getTime() / MILLISECONDS_PER_SECOND) });
}

describe('TotpService', () => {
  it('mints an enrolment with the secret sealed and the QR rendered locally', async () => {
    const enrolment = await buildService(frozenClock()).createEnrolment('ada@example.com');

    expect(enrolment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrolment.otpauthUri).toContain('otpauth://totp/');
    expect(enrolment.otpauthUri).toContain(encodeURIComponent('Reliance Bank'));
    expect(enrolment.sealedSecret).not.toContain(enrolment.secret);
    expect(enrolment.qrCodeDataUri.startsWith('data:image/')).toBe(true);
  });

  it('accepts a code generated for the current simulated instant', async () => {
    const service = buildService(frozenClock());
    const enrolment = await service.createEnrolment('ada@example.com');

    const acceptance = await service.check(
      enrolment.sealedSecret,
      await codeFor(enrolment.secret),
      null,
    );

    expect(acceptance.accepted).toBe(true);
    expect(acceptance.timeStep).not.toBeNull();
  });

  it('rejects a wrong code without naming which part failed', async () => {
    const service = buildService(frozenClock());
    const enrolment = await service.createEnrolment('ada@example.com');
    const valid = await codeFor(enrolment.secret);
    const wrong = valid === '000000' ? '000001' : '000000';

    const acceptance = await service.check(enrolment.sealedSecret, wrong, null);

    expect(acceptance).toEqual({ accepted: false, timeStep: null });
  });

  it('refuses a code whose time step was already spent, even when arithmetic passes', async () => {
    const service = buildService(frozenClock());
    const enrolment = await service.createEnrolment('ada@example.com');
    const code = await codeFor(enrolment.secret);

    const first = await service.check(enrolment.sealedSecret, code, null);
    const replay = await service.check(enrolment.sealedSecret, code, first.timeStep);

    expect(first.accepted).toBe(true);
    expect(replay.accepted).toBe(false);
  });

  it('verifies against the simulated clock, not the wall clock', async () => {
    const service = buildService(frozenClock());
    const enrolment = await service.createEnrolment('ada@example.com');
    // A code minted for the *wall* clock: valid right now in the real world, wrong in
    // the simulated one. Anchoring to ClockService is what makes this rejection correct.
    const wallClockCode = await generate({ secret: enrolment.secret });

    const acceptance = await service.check(enrolment.sealedSecret, wallClockCode, null);

    expect(acceptance.accepted).toBe(false);
  });
});
