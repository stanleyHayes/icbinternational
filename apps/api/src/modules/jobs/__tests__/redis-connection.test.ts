import { redisOptionsFromUrl } from '../redis-connection.js';

describe('redisOptionsFromUrl', () => {
  it('parses a bare host and applies the default port', () => {
    expect(redisOptionsFromUrl('redis://localhost:6579')).toEqual({
      host: 'localhost',
      port: 6579,
      maxRetriesPerRequest: null,
    });
  });

  it('defaults the port when the URL omits one', () => {
    expect(redisOptionsFromUrl('redis://cache.internal')).toMatchObject({
      host: 'cache.internal',
      port: 6379,
    });
  });

  it('parses credentials and a database index, decoding escapes', () => {
    expect(redisOptionsFromUrl('redis://svc:p%40ss@redis.example:6380/2')).toEqual({
      host: 'redis.example',
      port: 6380,
      username: 'svc',
      password: 'p@ss',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('enables TLS for rediss:// URLs', () => {
    expect(redisOptionsFromUrl('rediss://redis.example')).toMatchObject({ tls: {} });
  });

  it('keeps maxRetriesPerRequest null, which BullMQ workers require', () => {
    expect(redisOptionsFromUrl('redis://localhost').maxRetriesPerRequest).toBeNull();
  });
});
