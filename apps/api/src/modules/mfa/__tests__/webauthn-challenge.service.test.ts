import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigService } from '../../../config/config.service.js';
import { testConfig } from '../../auth/__tests__/test-environment.js';
import { CeremonyPurpose, WebAuthnChallengeService } from '../webauthn-challenge.service.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const OTHER_USER_ID = 'usr_01HZY1N8W1E3U1GI1HP4K2R1BB';
const CHALLENGE = 'Y2hhbGxlbmdlLWZyb20tdGhlLWJyb3dzZXI';

const FIVE_MINUTES_MS = 300_000;
const ONE_MINUTE_MS = 60_000;

function build(): { service: WebAuthnChallengeService; clock: ClockService } {
  const clock = new ClockService();
  clock.freezeAt(new Date('2026-02-01T12:00:00.000Z'));
  return {
    service: new WebAuthnChallengeService(new AppConfigService(testConfig()), clock),
    clock,
  };
}

describe('WebAuthnChallengeService', () => {
  it('round-trips an issued challenge for the same user and purpose', () => {
    const { service } = build();
    const issued = service.issue(USER_ID, CeremonyPurpose.REGISTER, CHALLENGE);

    expect(service.assertValid(CeremonyPurpose.REGISTER, issued.challengeId, USER_ID)).toBe(
      CHALLENGE,
    );
    expect(issued.expiresAt.getTime()).toBe(
      new Date('2026-02-01T12:00:00.000Z').getTime() + FIVE_MINUTES_MS,
    );
  });

  it('refuses a registration challenge replayed as an authentication one', () => {
    const { service } = build();
    const issued = service.issue(USER_ID, CeremonyPurpose.REGISTER, CHALLENGE);

    expect(() =>
      service.assertValid(CeremonyPurpose.AUTHENTICATE, issued.challengeId, USER_ID),
    ).toThrow(/could not verify/i);
  });

  it('refuses a challenge issued for someone else', () => {
    const { service } = build();
    const issued = service.issue(USER_ID, CeremonyPurpose.AUTHENTICATE, CHALLENGE);

    expect(() =>
      service.assertValid(CeremonyPurpose.AUTHENTICATE, issued.challengeId, OTHER_USER_ID),
    ).toThrow(/could not verify/i);
  });

  it('refuses a tampered challenge', () => {
    const { service } = build();
    const issued = service.issue(USER_ID, CeremonyPurpose.AUTHENTICATE, CHALLENGE);
    const tampered = issued.challengeId.replace(CHALLENGE, 'dGFtcGVyZWQ');

    expect(() => service.assertValid(CeremonyPurpose.AUTHENTICATE, tampered, USER_ID)).toThrow(
      /could not verify/i,
    );
  });

  it('refuses an expired challenge on the simulated clock', () => {
    const { service, clock } = build();
    const issued = service.issue(USER_ID, CeremonyPurpose.AUTHENTICATE, CHALLENGE);

    clock.advance(FIVE_MINUTES_MS + ONE_MINUTE_MS);

    expect(() =>
      service.assertValid(CeremonyPurpose.AUTHENTICATE, issued.challengeId, USER_ID),
    ).toThrow(/could not verify/i);
  });

  it('refuses malformed input without parsing it further', () => {
    const { service } = build();
    expect(() => service.assertValid(CeremonyPurpose.REGISTER, 'not-a-token', USER_ID)).toThrow(
      /could not verify/i,
    );
  });
});
