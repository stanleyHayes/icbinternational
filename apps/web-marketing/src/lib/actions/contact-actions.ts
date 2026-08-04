'use server';

/**
 * Lead capture and newsletter sign-up.
 *
 * Both run on the server, which is what lets the site stay static: the pages are
 * prerendered, and only the submission crosses to a running process. Both also validate
 * with the contract's own Zod schema rather than a hand-rolled copy — the API will apply
 * exactly this schema, so a form that passes here cannot be refused there for a reason
 * the customer was never shown.
 */

import { leadRequestSchema, newsletterRequestSchema } from '@reliance/contracts';

import { publicApi } from '@/lib/api/client';

import { failed, fromApiFailure, fromIssues, succeeded, type FormState } from './form-state';

/** A honeypot with anything in it was filled by a script, not a person. */
const HONEYPOT_FIELD = 'website';

const LEAD_ACKNOWLEDGEMENT =
  'Thank you — your enquiry is with us. We reply to messages within one working day.';

const NEWSLETTER_ACKNOWLEDGEMENT =
  'You are subscribed. Look out for the next edition at the start of the month.';

const CONSENT_REQUIRED = 'Please confirm you are happy for us to contact you about this enquiry.';

const NEWSLETTER_CONSENT_REQUIRED = 'Please confirm you are happy to receive the newsletter.';

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(form: FormData, field: string): string | undefined {
  const value = text(form, field);
  return value.length > 0 ? value : undefined;
}

/**
 * Submits a sales enquiry.
 *
 * A filled honeypot is answered with the same acknowledgement a real submission gets.
 * Telling a bot it was detected only tells whoever wrote it which field to leave alone.
 */
export async function submitLeadAction(_previous: FormState, form: FormData): Promise<FormState> {
  if (text(form, HONEYPOT_FIELD).length > 0) return succeeded(LEAD_ACKNOWLEDGEMENT);
  if (form.get('consent') !== 'on') return failed(CONSENT_REQUIRED, { consent: CONSENT_REQUIRED });

  const parsed = leadRequestSchema.safeParse({
    name: text(form, 'name'),
    email: text(form, 'email'),
    phone: optionalText(form, 'phone'),
    interest: text(form, 'interest'),
    message: optionalText(form, 'message'),
    consent: true,
  });

  if (!parsed.success) return fromIssues(parsed.error.issues);

  try {
    await publicApi().public.submitLead(parsed.data);
    return succeeded(LEAD_ACKNOWLEDGEMENT);
  } catch (error) {
    return fromApiFailure(error);
  }
}

/** Subscribes an address to the money-insights newsletter. */
export async function subscribeNewsletterAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  if (text(form, HONEYPOT_FIELD).length > 0) return succeeded(NEWSLETTER_ACKNOWLEDGEMENT);
  if (form.get('consent') !== 'on') {
    return failed(NEWSLETTER_CONSENT_REQUIRED, { consent: NEWSLETTER_CONSENT_REQUIRED });
  }

  const parsed = newsletterRequestSchema.safeParse({ email: text(form, 'email'), consent: true });
  if (!parsed.success) return fromIssues(parsed.error.issues);

  try {
    await publicApi().public.subscribeNewsletter(parsed.data);
    return succeeded(NEWSLETTER_ACKNOWLEDGEMENT);
  } catch (error) {
    return fromApiFailure(error);
  }
}
