import { JwtService } from '@nestjs/jwt';

import { ErrorCode } from '@reliance/contracts';

import { chatRig, CUSTOMER, TEST_JWT_SECRET } from './chat-harness.js';

describe('chat stream tokens', () => {
  it('round-trips the scope it was minted with', async () => {
    const rig = chatRig();

    const customer = await rig.tokens.mintForCustomer({ userId: CUSTOMER, sessionId: 'ses_1' });
    const agent = await rig.tokens.mintForAgent('adm_1');
    const guest = await rig.tokens.mintForGuest('cnv_1');

    await expect(rig.tokens.verify(customer.token)).resolves.toEqual({
      kind: 'customer',
      userId: CUSTOMER,
      sessionId: 'ses_1',
    });
    await expect(rig.tokens.verify(agent.token)).resolves.toEqual({
      kind: 'agent',
      adminId: 'adm_1',
    });
    await expect(rig.tokens.verify(guest.token)).resolves.toEqual({
      kind: 'guest',
      conversationId: 'cnv_1',
    });
  });

  it('states its expiry, five minutes out on the simulated clock', async () => {
    const rig = chatRig();

    const minted = await rig.tokens.mintForGuest('cnv_1');

    expect(minted.expiresAt).toBe(rig.clock.inSeconds(300).toISOString());
  });

  it('rejects a token minted for another purpose, however well signed', async () => {
    const rig = chatRig();
    const now = Math.floor(rig.clock.timestamp() / 1000);
    const foreign = await new JwtService().signAsync(
      { typ: 'access', sco: { kind: 'guest', conversationId: 'cnv_1' }, iat: now, exp: now + 300 },
      { secret: TEST_JWT_SECRET },
    );

    await expect(rig.tokens.verify(foreign)).rejects.toMatchObject({
      code: ErrorCode.TOKEN_INVALID,
    });
  });

  it('rejects a token whose scope does not parse', async () => {
    const rig = chatRig();
    const now = Math.floor(rig.clock.timestamp() / 1000);
    const malformed = await new JwtService().signAsync(
      { typ: 'chat', sco: { kind: 'customer' }, iat: now, exp: now + 300 },
      { secret: TEST_JWT_SECRET },
    );

    await expect(rig.tokens.verify(malformed)).rejects.toMatchObject({
      code: ErrorCode.TOKEN_INVALID,
    });
  });

  it('rejects an expired token, on the simulated clock', async () => {
    const rig = chatRig();
    const minted = await rig.tokens.mintForGuest('cnv_1');

    rig.clock.advance(301_000);

    await expect(rig.tokens.verify(minted.token)).rejects.toMatchObject({
      code: ErrorCode.TOKEN_EXPIRED,
    });
  });

  it('rejects a forgery signed with the wrong secret', async () => {
    const rig = chatRig();
    const now = Math.floor(rig.clock.timestamp() / 1000);
    const forged = await new JwtService().signAsync(
      { typ: 'chat', sco: { kind: 'agent', adminId: 'adm_1' }, iat: now, exp: now + 300 },
      { secret: 'not-the-secret' },
    );

    await expect(rig.tokens.verify(forged)).rejects.toMatchObject({
      code: ErrorCode.TOKEN_INVALID,
    });
  });
});
