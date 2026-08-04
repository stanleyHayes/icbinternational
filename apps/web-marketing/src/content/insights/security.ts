import type { InsightArticle } from './types';

/** Articles in the Security section. */
export const SECURITY_ARTICLES: readonly InsightArticle[] = [
  {
    slug: 'five-signs-a-payment-request-is-a-scam',
    title: 'Five signs a payment request is a scam',
    excerpt:
      'Authorised push payment fraud works by making you the one who presses send. These are ' +
      'the five signals that appear in almost every case we see.',
    category: 'Security',
    author: { name: 'Priya Raman', role: 'Head of Financial Crime' },
    publishedAt: '2026-07-14',
    readingMinutes: 5,
    tags: ['fraud', 'scams', 'payments'],
    body: [
      {
        kind: 'paragraph',
        text:
          'The fraud that costs people the most is not the kind where someone steals a card. It ' +
          'is the kind where someone persuades you to make the payment yourself. Because you ' +
          'authorised it, the payment leaves cleanly and the money is often gone within minutes.',
      },
      {
        kind: 'paragraph',
        text:
          'Almost every case has the same shape. Learn the shape and you will recognise it even ' +
          'when the story is new.',
      },
      { kind: 'heading', text: '1. It arrived, you did not go looking for it' },
      {
        kind: 'paragraph',
        text:
          'A call, a text, an email, a message on a marketplace. You did not initiate contact. ' +
          'That single fact is the strongest signal there is, and it holds even when the caller ' +
          'ID shows a number you recognise — caller ID can be forged, and routinely is.',
      },
      { kind: 'heading', text: '2. There is a deadline' },
      {
        kind: 'paragraph',
        text:
          'Your account will be suspended today. The property will go to someone else this ' +
          'afternoon. The officer is waiting. Urgency is not incidental to the scam; it is the ' +
          'mechanism. It exists to stop you doing the one thing that would end it — checking.',
      },
      { kind: 'heading', text: '3. You are asked to move money to keep it safe' },
      {
        kind: 'paragraph',
        text:
          'No bank, no police force and no government department will ever ask you to move money ' +
          'to a "safe account". There is no such thing. If your money were genuinely at risk, we ' +
          'would freeze the account ourselves — we do not need your help to do it.',
      },
      {
        kind: 'callout',
        title: 'We will never ask for a passcode',
        text:
          'Not the one-time code we text you, not your card PIN, not your passcode, and never ' +
          'over the phone. Anyone who asks is not from Reliance Bank, whatever their number says.',
      },
      { kind: 'heading', text: '4. The bank details changed at the last minute' },
      {
        kind: 'paragraph',
        text:
          'This is invoice redirection, and it hits businesses and house purchases hardest. An ' +
          'email arrives from a supplier or a solicitor you have been dealing with for weeks, ' +
          'saying their account details have changed. The email address is a character different ' +
          'from the real one.',
      },
      {
        kind: 'paragraph',
        text:
          'Always verify a change of bank details by calling a number you already had — not the ' +
          'one in the email.',
      },
      { kind: 'heading', text: '5. You have been told not to tell us' },
      {
        kind: 'paragraph',
        text:
          'You are asked to keep the payment confidential, to describe it as something else if we ' +
          'ask, or to say it is going to your own account. That instruction has exactly one ' +
          'purpose: to get past the check that would have stopped it.',
      },
      { kind: 'heading', text: 'If you think you have paid a fraudster' },
      {
        kind: 'steps',
        items: [
          'Freeze your card in the app. It takes one tap and is instant.',
          'Report it in the app or call us on 020 7946 0100. The sooner we know, the more we can recall.',
          'Do not continue the conversation with the person who contacted you.',
          'Report it to Action Fraud so it counts towards the national picture.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'You will not be judged for it. These attacks are professionally run and designed to be ' +
          'convincing. Telling us quickly is what makes recovery possible.',
      },
    ],
  },
  {
    slug: 'passkeys-explained',
    title: 'Passkeys, explained without the jargon',
    excerpt:
      'A passkey is not a password you cannot see. It is a different mechanism, and it removes ' +
      'the single most common way accounts are taken over.',
    category: 'Security',
    author: { name: 'Tom Ashworth', role: 'Principal Security Engineer' },
    publishedAt: '2026-04-09',
    readingMinutes: 4,
    tags: ['passkeys', 'log in', 'phishing'],
    body: [
      {
        kind: 'paragraph',
        text:
          'A password has a design flaw that no amount of length or complexity fixes: you have to ' +
          'send it to whoever is asking. If the thing asking is a convincing copy of your bank, ' +
          'you have just handed over the key.',
      },
      { kind: 'heading', text: 'What a passkey actually is' },
      {
        kind: 'paragraph',
        text:
          'When you create a passkey, your device generates two related keys. One stays on the ' +
          'device, protected by your fingerprint, face or device passcode, and never leaves it. ' +
          'The other is given to us. To log in, your device proves it holds the private key by ' +
          'signing a challenge we send. The secret itself is never transmitted.',
      },
      {
        kind: 'paragraph',
        text:
          'There is nothing for a counterfeit site to capture, because nothing secret is sent. And ' +
          'the passkey is bound to our real domain, so it will not even offer itself to a lookalike.',
      },
      { kind: 'heading', text: 'What it means day to day' },
      {
        kind: 'list',
        items: [
          'Logging in is a fingerprint or a glance, not a password and a code.',
          'There is nothing to remember, reuse, or leak in someone else’s data breach.',
          'A phishing page cannot collect it, however good the copy.',
          'It syncs across your devices through your platform’s keychain, so a lost phone is not a lockout.',
        ],
      },
      {
        kind: 'callout',
        title: 'Keep one other way in',
        text:
          'Register a passkey on a second device, or keep an authenticator app enrolled. One ' +
          'route into an account is one route to lose.',
      },
      { kind: 'heading', text: 'Is it safer than a password and a text code?' },
      {
        kind: 'paragraph',
        text:
          'Meaningfully, yes. A one-time code sent by text is better than nothing, but it can be ' +
          'read out to a convincing caller, intercepted by a SIM swap, or entered into a counterfeit ' +
          'page in real time. A passkey cannot be given away, because there is nothing to give.',
      },
    ],
  },
];
