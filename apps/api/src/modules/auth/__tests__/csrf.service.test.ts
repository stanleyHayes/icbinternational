import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/config.service.js';
import { CsrfService } from '../csrf.service.js';

import { testConfig } from './test-environment.js';

function makeService(): CsrfService {
  return new CsrfService(new AppConfigService(testConfig()));
}

jest.setTimeout(120_000);

describe('CsrfService', () => {
  it('accepts a header that echoes a genuine cookie', () => {
    const service = makeService();
    const cookie = service.issue();

    expect(() => service.assert(cookie, cookie)).not.toThrow();
  });

  it('rejects a missing header or cookie', () => {
    const service = makeService();
    const cookie = service.issue();

    expect(() => service.assert(undefined, cookie)).toThrow(AppError);
    expect(() => service.assert(cookie, undefined)).toThrow(AppError);
  });

  it('rejects a header that does not match the cookie', () => {
    const service = makeService();

    expect(() => service.assert(service.issue(), service.issue())).toThrow(AppError);
  });

  it('rejects a forged cookie the server never signed', () => {
    const service = makeService();
    const forged = 'attacker-chosen-token.attacker-chosen-signature';

    expect(() => service.assert(forged, forged)).toThrow(AppError);
  });

  it('rejects a genuine cookie whose token was edited', () => {
    const service = makeService();
    const [, signature] = service.issue().split('.');
    const tampered = `edited-token.${signature}`;

    expect(() => service.assert(tampered, tampered)).toThrow(AppError);
  });

  it('reports every failure as FORBIDDEN', () => {
    const service = makeService();

    try {
      service.assert(undefined, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.FORBIDDEN);
    }
  });
});
