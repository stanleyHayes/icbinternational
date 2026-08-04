/**
 * Confirming a mobile number.
 *
 * The frozen contract has `phoneVerified` on the user but no route that sets it — `routes.auth`
 * covers email confirmation and nothing equivalent for a phone. Rather than invent a second
 * mechanism out of the MFA challenge (which answers a different question: "is this the person who
 * owns the account", not "does this person own this number"), the two calls are made through the
 * typed client's own escape hatch at the paths the contract is expected to grow.
 *
 * A handoff note is open against `packages/contracts` and the auth module. Until it lands these
 * two calls answer `SERVICE_UNAVAILABLE`, the screen says so in the bank's own words, and the
 * customer is offered the "do this later" path — which is behaviour a real bank has anyway, for
 * the days its SMS provider is down.
 */

import { z } from 'zod';

import { acknowledgedSchema, otpSchema, phoneSchema, type Acknowledged } from '@reliance/contracts';

import { browserApi } from './api';

/** Path the contract is expected to expose for sending a confirmation code. */
const REQUEST_PATH = '/auth/phone/send-code';

/** Path the contract is expected to expose for checking one. */
const CONFIRM_PATH = '/auth/phone/verify';

/** Body of a send-code request. */
export const requestPhoneCodeSchema = z.object({ phone: phoneSchema });
/** A send-code request. */
export type RequestPhoneCode = z.infer<typeof requestPhoneCodeSchema>;

/** Body of a confirm request. */
export const confirmPhoneSchema = z.object({ phone: phoneSchema, code: otpSchema });
/** A confirm request. */
export type ConfirmPhone = z.infer<typeof confirmPhoneSchema>;

/** Sends a six-digit code to the number. Rate limited server-side. */
export function sendPhoneCode(body: RequestPhoneCode): Promise<Acknowledged> {
  return browserApi().http.post({ path: REQUEST_PATH, body, schema: acknowledgedSchema });
}

/** Confirms the number with the code that was sent to it. */
export function confirmPhone(body: ConfirmPhone): Promise<Acknowledged> {
  return browserApi().http.post({ path: CONFIRM_PATH, body, schema: acknowledgedSchema });
}
