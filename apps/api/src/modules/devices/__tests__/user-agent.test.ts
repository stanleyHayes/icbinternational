import { describeUserAgent } from '../user-agent.js';

describe('describeUserAgent', () => {
  const cases: [string, string, string][] = [
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Chrome on macOS',
      'macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
      'iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
      'Android',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/125.0.0.0',
      'Edge on Windows',
      'Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Firefox on Linux',
      'Linux',
    ],
    ['curl/8.6.0', 'Unknown browser on Unknown platform', 'Unknown platform'],
  ];

  it.each(cases)('describes %s as %s', (userAgent, label, platform) => {
    expect(describeUserAgent(userAgent)).toEqual({ label, platform });
  });

  it('prefers Edge over Chrome when both tokens appear', () => {
    const ua = 'Mozilla/5.0 Chrome/126.0.0.0 Edg/126.0.0.0';
    expect(describeUserAgent(ua).label).toBe('Edge on Unknown platform');
  });
});
