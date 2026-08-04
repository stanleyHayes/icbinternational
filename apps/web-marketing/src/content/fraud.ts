import type { Prose } from './prose';

/** One scam pattern, described the way a customer would encounter it. */
export interface ScamPattern {
  readonly name: string;
  readonly howItStarts: string;
  readonly whatTheyWant: string;
  readonly tell: string;
}

/** The scams we see most, in the order they cost customers the most money. */
export const SCAM_PATTERNS: readonly ScamPattern[] = [
  {
    name: 'The safe account',
    howItStarts:
      'A call, apparently from your bank or the police, saying your account has been compromised ' +
      'and there is an investigation under way.',
    whatTheyWant:
      'You to move your balance to a "safe account" they provide, sometimes while staying on the ' +
      'line so you cannot check.',
    tell: 'There is no such thing as a safe account. If your money were at risk we would freeze the account ourselves.',
  },
  {
    name: 'Invoice redirection',
    howItStarts:
      'An email from a supplier, builder or solicitor you have been dealing with for weeks, saying ' +
      'their bank details have changed.',
    whatTheyWant: 'The next payment, which is often the largest one of the whole project.',
    tell: 'Bank details do not change mid-job. Verify by calling a number you already had — never the one in the email.',
  },
  {
    name: 'The purchase that never arrives',
    howItStarts:
      'An item on a marketplace at a good but not absurd price, and a seller who wants to move the ' +
      'conversation off the platform.',
    whatTheyWant: 'A bank transfer instead of the platform’s own payment, "to save the fees".',
    tell: 'A bank transfer has none of the buyer protection a card payment or a platform checkout has. That is why they want it.',
  },
  {
    name: 'The investment with no downside',
    howItStarts:
      'An advertisement, often using a public figure’s photograph without permission, promising ' +
      'returns well above anything a deposit pays.',
    whatTheyWant:
      'An initial deposit, then a second one to "release" the profits shown on a portal that does ' +
      'not exist.',
    tell: 'Returns and risk move together, always. A guaranteed return well above the base rate is a guaranteed loss.',
  },
  {
    name: 'The message from your child',
    howItStarts:
      'A text from an unknown number: "Mum, this is my new number, my phone is broken." A friendly, ' +
      'plausible conversation follows.',
    whatTheyWant: 'An urgent transfer for a bill they cannot pay from the new phone.',
    tell: 'Call the number you have saved. If they really have lost their phone, someone else in the family will know.',
  },
  {
    name: 'The refund that overpays',
    howItStarts:
      'A caller says you are owed a refund, takes remote control of your computer to "process" it, ' +
      'and shows you a payment for far too much.',
    whatTheyWant: 'You to send the difference back. The original payment was never real.',
    tell: 'Never let anyone you did not call take control of your device, and never trust a balance shown to you by someone else.',
  },
];

/** What to do in the hour after realising. Order matters: the first two are time-critical. */
export const IF_IT_HAPPENED: Prose = [
  {
    kind: 'paragraph',
    text:
      'The single biggest factor in whether money comes back is how quickly we hear about it. ' +
      'Nobody at Reliance Bank will judge you for this — these attacks are professionally run and ' +
      'designed to work on careful people.',
  },
  {
    kind: 'steps',
    items: [
      'Freeze your card in the app. One tap, instant, reversible.',
      'Call us on 020 7946 0100, or dial 159 from any phone to be connected to your bank.',
      'Stop talking to whoever contacted you. Do not warn them, do not confirm anything.',
      'Change your passcode and check the device list in the app for anything you do not recognise.',
      'Report it to Action Fraud, so it counts towards the national picture and the case can be linked to others.',
    ],
  },
  {
    kind: 'callout',
    title: 'You will not have to argue for a refund',
    text:
      'Where a payment was not authorised by you, we refund it and then investigate — not the ' +
      'other way round.',
  },
];
