import { ClockService } from '../../../common/clock/clock.service.js';
import { type Environment } from '../../../config/configuration.js';
import { DownloadLinkService } from '../download-link.service.js';
import {
  DOWNLOAD_LINK_TTL_SECONDS,
  EXPIRES_PARAM,
  SIGNATURE_PARAM,
} from '../statements.constants.js';

const environment = {
  API_URL: 'https://api.bank.example',
  ENCRYPTION_KEY: 'a'.repeat(64),
} as Environment;

const PATH = '/accounts/acc_01JQ8Z00000000000000000001/statements/stm_x/document';
const MILLISECONDS_PER_SECOND = 1000;

function build(): { links: DownloadLinkService; clock: ClockService } {
  const clock = new ClockService();
  clock.freezeAt(new Date('2026-03-04T12:00:00.000Z'));
  return { links: new DownloadLinkService(environment, clock), clock };
}

/** Splits a signed link back into the parts a controller would hand to `verify`. */
function parse(url: string): { expires: string; signature: string } {
  const parsed = new URL(url);
  return {
    expires: parsed.searchParams.get(EXPIRES_PARAM) ?? '',
    signature: parsed.searchParams.get(SIGNATURE_PARAM) ?? '',
  };
}

describe('DownloadLinkService', () => {
  it('signs an absolute URL under the API version prefix', () => {
    const { links } = build();
    const url = new URL(links.sign(PATH));

    expect(url.origin).toBe('https://api.bank.example');
    expect(url.pathname).toBe(`/v1${PATH}`);
    expect(url.searchParams.get(SIGNATURE_PARAM)).toBeTruthy();
  });

  it('accepts the link it issued', () => {
    const { links } = build();
    const signed = parse(links.sign(PATH));

    expect(() => links.verify({ path: PATH, query: {}, ...signed })).not.toThrow();
  });

  it('refuses a link pointed at a different document', () => {
    const { links } = build();
    const signed = parse(links.sign(PATH));

    expect(() => links.verify({ path: `${PATH}x`, query: {}, ...signed })).toThrow(
      /not one we issued/,
    );
  });

  it('refuses a link whose signed parameters have been edited', () => {
    const { links } = build();
    const query = { account: 'acc_01JQ8Z00000000000000000001' };
    const signed = parse(links.sign(PATH, query));

    expect(() =>
      links.verify({ path: PATH, query: { account: 'acc_01JQ8Z00000000000000000002' }, ...signed }),
    ).toThrow(/not one we issued/);
  });

  it('refuses a link once it has aged out', () => {
    const { links, clock } = build();
    const signed = parse(links.sign(PATH));

    clock.advance((DOWNLOAD_LINK_TTL_SECONDS + 1) * MILLISECONDS_PER_SECOND);
    expect(() => links.verify({ path: PATH, query: {}, ...signed })).toThrow(/expired/);
  });
});
