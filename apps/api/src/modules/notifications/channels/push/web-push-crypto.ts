/**
 * Web push payload encryption (RFC 8291) and VAPID authentication (RFC 8292).
 *
 * Implemented against Node's own crypto rather than pulled in as a dependency, because the
 * two specifications are small, entirely deterministic, and the alternative is a
 * third-party package with network access sitting in the path of a bank's security
 * notifications.
 *
 * The important property: the push service is a relay we do not control and cannot read
 * the payload. Content is encrypted to a key pair the browser generated and never sent us
 * the private half of, so "someone signed into your account" is not readable by whoever
 * operates the endpoint.
 *
 * Every step below is named after the specification's own term so the two can be read side
 * by side.
 */

import {
  createECDH,
  createHmac,
  createSign,
  createPrivateKey,
  randomBytes,
  createCipheriv,
} from 'node:crypto';

const CURVE = 'prime256v1';
const SALT_BYTES = 16;
const KEY_BYTES = 16;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PUBLIC_KEY_BYTES = 65;
const RECORD_SIZE_BYTES = 4;
const ONE = Buffer.from([1]);
/** `aes128gcm` pads plaintext with a delimiter; `2` marks the final record. */
const LAST_RECORD_DELIMITER = Buffer.from([2]);

/**
 * Label for each HKDF step, each terminated by a NUL byte.
 *
 * The terminator is part of the label in both specifications. Written as an explicit
 * concatenation rather than an escape inside a string literal, because a NUL that has been
 * silently turned into a space by an editor or a copy-paste produces a body the browser
 * rejects with no diagnostic beyond "decryption failed".
 */
const NUL = Buffer.from([0]);
const label = (text: string): Buffer => Buffer.concat([Buffer.from(text, 'utf8'), NUL]);

const KEY_INFO_PREFIX = label('WebPush: info');
const CEK_INFO = label('Content-Encoding: aes128gcm');
const NONCE_INFO = label('Content-Encoding: nonce');

/**
 * Declared record size, per RFC 8188 section 2.
 *
 * A fixed 4 KiB rather than the exact ciphertext length: `rs` tells the receiver the
 * largest record to expect, and the conventional value is what every browser is tested
 * against. It also bounds the payload, which is what {@link MAX_PAYLOAD_BYTES} exposes.
 */
const RECORD_SIZE = 4096;

/** Ciphertext overhead: the GCM tag plus the one-byte record delimiter. */
const RECORD_OVERHEAD_BYTES = AUTH_TAG_BYTES + 1;

/** Largest payload that fits one record. A push notification is a headline, not a document. */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - RECORD_OVERHEAD_BYTES;

export interface PushSubscriptionKeys {
  /** The browser's public key, base64url, uncompressed P-256 point. */
  readonly p256dh: string;
  /** The browser's authentication secret, base64url, 16 bytes. */
  readonly auth: string;
}

export interface EncryptedPush {
  readonly body: Buffer;
  readonly headers: Readonly<Record<string, string>>;
}

/** HKDF as the web-push specifications use it: extract then one 32-byte expand step. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const okm = createHmac('sha256', prk)
    .update(Buffer.concat([info, ONE]))
    .digest();
  return okm.subarray(0, length);
}

interface DerivedKeys {
  readonly salt: Buffer;
  readonly serverPublicKey: Buffer;
  readonly contentEncryptionKey: Buffer;
  readonly nonce: Buffer;
}

/**
 * RFC 8291 section 3.4.
 *
 * The pseudo-random key mixes the ECDH secret with the subscription's auth secret *and*
 * both public keys, which is what stops a payload encrypted for one subscription being
 * replayed against another.
 */
function deriveContentKeys(clientPublicKey: Buffer, authSecret: Buffer): DerivedKeys {
  const ecdh = createECDH(CURVE);
  ecdh.generateKeys();
  const serverPublicKey = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublicKey);

  const keyInfo = Buffer.concat([KEY_INFO_PREFIX, clientPublicKey, serverPublicKey]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, KEY_BYTES * 2);
  const salt = randomBytes(SALT_BYTES);

  return {
    salt,
    serverPublicKey,
    contentEncryptionKey: hkdf(salt, ikm, CEK_INFO, KEY_BYTES),
    nonce: hkdf(salt, ikm, NONCE_INFO, NONCE_BYTES),
  };
}

/**
 * Encrypts a payload for one subscription.
 *
 * @throws {RangeError} when the subscription's keys are not the sizes the specification
 *   requires — a browser never sends anything else, so a mismatch means the stored
 *   subscription is corrupt and sending it would fail opaquely at the push service.
 */
export function encryptPushPayload(payload: string, keys: PushSubscriptionKeys): EncryptedPush {
  const clientPublicKey = Buffer.from(keys.p256dh, 'base64url');
  const authSecret = Buffer.from(keys.auth, 'base64url');

  if (clientPublicKey.length !== PUBLIC_KEY_BYTES) {
    throw new RangeError('Push subscription public key is not an uncompressed P-256 point');
  }
  if (authSecret.length !== KEY_BYTES) {
    throw new RangeError('Push subscription auth secret must be 16 bytes');
  }
  if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`A push payload must be at most ${MAX_PAYLOAD_BYTES} bytes`);
  }

  const derived = deriveContentKeys(clientPublicKey, authSecret);
  const { salt, serverPublicKey, contentEncryptionKey, nonce } = derived;

  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), LAST_RECORD_DELIMITER]);
  const cipher = createCipheriv('aes-128-gcm', contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(RECORD_SIZE_BYTES);
  recordSize.writeUInt32BE(RECORD_SIZE);

  const body = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublicKey.length]),
    serverPublicKey,
    ciphertext,
  ]);

  return {
    body,
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
    },
  };
}

export interface VapidInput {
  /** Scheme and host of the push endpoint, e.g. `https://fcm.googleapis.com`. */
  readonly audience: string;
  /** `mailto:` or `https:` contact for the push service operator. */
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
  readonly expiresAtSeconds: number;
}

/**
 * Builds the `Authorization` header a push service requires.
 *
 * A VAPID token is an ES256 JWT over `{aud, exp, sub}`, signed with the private half of
 * the key pair whose public half the browser recorded at subscription time. It identifies
 * *us* to the push service; it has nothing to do with the payload encryption above, and
 * the two are frequently conflated.
 */
export function buildVapidAuthorization(input: VapidInput): string {
  const header = base64UrlJson({ typ: 'JWT', alg: 'ES256' });
  const claims = base64UrlJson({
    aud: input.audience,
    exp: input.expiresAtSeconds,
    sub: input.subject,
  });

  const signingInput = `${header}.${claims}`;
  const signature = signEs256(signingInput, input.privateKey);

  return `vapid t=${signingInput}.${signature}, k=${input.publicKey}`;
}

function base64UrlJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Signs with ES256, producing the fixed-width `r||s` form JWT requires.
 *
 * Node emits DER by default, and a DER signature in a JWT is rejected by every push
 * service — an easy mistake to make and a hard one to diagnose, because the failure is a
 * bare 401.
 */
function signEs256(signingInput: string, privateKeyBase64Url: string): string {
  const key = createPrivateKey({
    key: toPkcs8(Buffer.from(privateKeyBase64Url, 'base64url')),
    format: 'der',
    type: 'pkcs8',
  });

  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key, dsaEncoding: 'ieee-p1363' });

  return signature.toString('base64url');
}

/**
 * Wraps a raw 32-byte P-256 scalar in the PKCS#8 envelope Node insists on.
 *
 * VAPID keys are distributed as the bare scalar; the prefix below is the constant ASN.1
 * header for an unencrypted P-256 private key, so no ASN.1 encoder is needed.
 */
const PKCS8_P256_PREFIX = Buffer.from(
  '308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420',
  'hex',
);

const RAW_SCALAR_BYTES = 32;

function toPkcs8(rawScalar: Buffer): Buffer {
  if (rawScalar.length !== RAW_SCALAR_BYTES) {
    throw new RangeError('A VAPID private key must be 32 bytes');
  }
  return Buffer.concat([PKCS8_P256_PREFIX, rawScalar]);
}
