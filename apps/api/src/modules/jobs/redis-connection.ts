import { type RedisOptions } from 'ioredis';

import { DEFAULT_REDIS_PORT } from './jobs.constants.js';

/**
 * Injection token for the Redis connection options every BullMQ primitive shares.
 *
 * BullMQ creates a dedicated connection per Queue, Worker and QueueEvents from these
 * options — deliberately: a Worker's blocking fetches must never share a connection
 * with a Queue's commands, so options are passed rather than a live client.
 */
export const JOB_REDIS_CONNECTION = Symbol('JOB_REDIS_CONNECTION');

/**
 * Parses a `redis[s]://[user[:password]@]host[:port][/db]` URL into ioredis options.
 *
 * `maxRetriesPerRequest: null` is a BullMQ hard requirement for worker connections —
 * a retried blocking fetch would otherwise corrupt job state after a reconnect.
 */
export function redisOptionsFromUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const options: RedisOptions = {
    host: url.hostname,
    port: url.port === '' ? DEFAULT_REDIS_PORT : Number(url.port),
    maxRetriesPerRequest: null,
  };

  if (url.username !== '') options.username = decodeURIComponent(url.username);
  if (url.password !== '') options.password = decodeURIComponent(url.password);

  const database = url.pathname.replace('/', '');
  if (database !== '') options.db = Number(database);
  if (url.protocol === 'rediss:') options.tls = {};

  return options;
}
