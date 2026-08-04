/**
 * WebAuthn plumbing for signing in with a passkey.
 *
 * The API hands over the ceremony options exactly as its WebAuthn library produced them, and the
 * assertion goes back exactly as the authenticator produced it. The only work done here is the
 * base64url ⇄ `ArrayBuffer` translation the browser API requires, because a signature is computed
 * over bytes and anything this layer "helpfully" reshaped would no longer verify.
 */

/** A ceremony that could not be completed, with copy already fit to show a customer. */
export class PasskeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasskeyError';
  }
}

const UNAVAILABLE = 'This device cannot use passkeys. Sign in with your password instead.';
const ABANDONED = 'The passkey prompt was closed before it finished.';

const BASE64_PAD = 4;

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const remainder = padded.length % BASE64_PAD;
  const binary = globalThis.atob(
    remainder ? padded.padEnd(padded.length + BASE64_PAD - remainder, '=') : padded,
  );
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function toBase64Url(buffer: ArrayBuffer | null): string | null {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function requiredString(source: Readonly<Record<string, unknown>>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new PasskeyError(UNAVAILABLE);
  return value;
}

function allowedCredentials(
  source: Readonly<Record<string, unknown>>,
): PublicKeyCredentialDescriptor[] {
  const raw = source['allowCredentials'];
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry): PublicKeyCredentialDescriptor[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== 'string') return [];
    return [{ id: fromBase64Url(id), type: 'public-key' }];
  });
}

/** True when this browser can run a passkey ceremony at all. */
export function passkeysAvailable(): boolean {
  return (
    typeof globalThis.PublicKeyCredential === 'function' &&
    Boolean(globalThis.navigator?.credentials)
  );
}

/**
 * Runs the sign-in ceremony and returns the assertion, ready to post back verbatim.
 *
 * @param options the `publicKey` block the API sent, untouched.
 * @throws {PasskeyError} when the browser cannot run the ceremony, or the customer dismissed it.
 */
export async function assertPasskey(
  options: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  if (!passkeysAvailable()) throw new PasskeyError(UNAVAILABLE);

  const request: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64Url(requiredString(options, 'challenge')),
    allowCredentials: allowedCredentials(options),
    userVerification: 'preferred',
    ...(typeof options['rpId'] === 'string' ? { rpId: options['rpId'] } : {}),
  };

  const credential = await obtain(request);
  return serialise(credential);
}

async function obtain(request: PublicKeyCredentialRequestOptions): Promise<PublicKeyCredential> {
  let credential: Credential | null;
  try {
    credential = await globalThis.navigator.credentials.get({ publicKey: request });
  } catch {
    throw new PasskeyError(ABANDONED);
  }
  if (!credential || !('rawId' in credential)) throw new PasskeyError(ABANDONED);
  return credential as PublicKeyCredential;
}

function serialise(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: toBase64Url(response.userHandle),
    },
  };
}
