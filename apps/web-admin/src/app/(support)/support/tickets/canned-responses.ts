/**
 * The replies an agent sends twenty times a day.
 *
 * Canned responses exist to make the twentieth reply as careful as the first, not to save
 * typing. Each one is written to be sent as it stands — it opens by naming what the
 * customer asked, says what we are doing, and says when they will hear again. An agent
 * edits the specifics; the shape and the tone are already right.
 *
 * None of them apologise for "any inconvenience caused". A bank that has stopped
 * somebody's card says what it has done and what happens next.
 */

/** One reusable reply, grouped by the kind of question it answers. */
export interface CannedResponse {
  readonly id: string;
  readonly topic: string;
  readonly label: string;
  readonly body: string;
}

/** The response library, in the order agents reach for them. */
export const CANNED_RESPONSES: readonly CannedResponse[] = [
  {
    id: 'card-declined',
    topic: 'Cards',
    label: 'Why a card payment was declined',
    body: `Thank you for getting in touch about the payment that was declined.

I have looked at the authorisation on your account. The payment was stopped because it fell outside one of the controls set on your card, not because of a problem with the merchant.

You can turn that control on or off yourself under Cards in the app. If you would like me to make the change for you, reply to this message and confirm and I will do it now.`,
  },
  {
    id: 'card-blocked-fraud',
    topic: 'Cards',
    label: 'Card stopped after suspicious activity',
    body: `We have stopped your card because we saw activity on it that did not look like you.

Your money is safe and nothing further can be taken on that card. A replacement is on its way and will reach you within five working days; you can add it to your phone as soon as it arrives.

If you recognise the payments in question, reply to this message and we will look again.`,
  },
  {
    id: 'transfer-pending',
    topic: 'Payments',
    label: 'A transfer has not arrived yet',
    body: `Thank you for chasing this up.

The payment has left your account and is with the receiving bank. Most transfers arrive within two hours, but the receiving bank can take up to one working day to show it on the recipient's statement.

If it has not arrived by the end of the next working day, reply here and we will raise a trace with the receiving bank on your behalf.`,
  },
  {
    id: 'dispute-opened',
    topic: 'Payments',
    label: 'A dispute has been opened',
    body: `We have opened a dispute for the payment you told us about.

We will contact the merchant and give them the chance to respond. This normally takes up to fifteen working days, and we will write to you as soon as we have their answer or sooner if we reach a decision before then.

If you have a receipt, an order confirmation or any correspondence with the merchant, sending it to us now will help.`,
  },
  {
    id: 'kyc-more-info',
    topic: 'Account',
    label: 'More information needed to verify identity',
    body: `Thank you for sending your documents.

We need one more thing before we can finish verifying your account. Please send a document from the last three months showing your name and current address — a bank statement, a utility bill or a council tax letter all work.

You can upload it under Identity in the app. We normally review a new document within two working days.`,
  },
  {
    id: 'account-frozen',
    topic: 'Account',
    label: 'Account access restricted',
    body: `We have restricted access to your account while we complete a review.

Money paid into your account is still being credited and nothing has been lost. We cannot go into the detail of the review, but we will contact you as soon as it is finished.

If you need to talk to someone about an urgent payment while the review is running, reply here and we will do what we can.`,
  },
  {
    id: 'statement-request',
    topic: 'Account',
    label: 'Sending a statement or a bank letter',
    body: `Thank you for your request.

You can download statements for any month under Documents in the app, and a certificate of balance is available there too.

If you need something in a particular format — for a visa application, a mortgage lender or an employer — tell me what they have asked for and I will prepare it.`,
  },
  {
    id: 'closing-resolved',
    topic: 'General',
    label: 'Closing a resolved conversation',
    body: `I am glad that is sorted.

I will close this conversation now, but you can reply to it at any time in the next thirty days and it will come straight back to me.

If you have a moment, there is a short rating at the bottom of this message. It goes to my team, not to a survey company.`,
  },
];

/** Every distinct topic in the library, for grouping the picker. */
export function cannedTopics(): readonly string[] {
  return [...new Set(CANNED_RESPONSES.map((response) => response.topic))];
}
