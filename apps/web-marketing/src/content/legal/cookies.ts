import type { Prose } from '../prose';

/** The cookie policy. */
export const COOKIES: Prose = [
  {
    kind: 'paragraph',
    text:
      'A cookie is a small file a website asks your browser to keep. This page lists every cookie ' +
      'reliancebank.example sets, what each one does and how long it lasts. There are no advertising ' +
      'cookies on this site and no third-party trackers.',
  },
  { kind: 'heading', text: 'Strictly necessary' },
  {
    kind: 'paragraph',
    text:
      'These keep the site secure and working, and cannot be turned off. They carry no information ' +
      'that identifies you personally.',
  },
  {
    kind: 'list',
    items: [
      'rb-cookie-choice — remembers the choice you made in the cookie banner, so we stop asking. Kept for one year, in your browser only.',
      'rb-theme — remembers whether you chose the light or dark appearance. Kept until you clear it.',
      'rb.csrf — protects forms against cross-site request forgery. Expires when you close the browser.',
    ],
  },
  { kind: 'heading', text: 'Analytics' },
  {
    kind: 'paragraph',
    text:
      'Only set if you accept them. They tell us which pages help people and which do not — for ' +
      'example, whether anybody finds the fee table useful. The data is aggregated and we do not ' +
      'attempt to identify individuals from it.',
  },
  {
    kind: 'list',
    items: [
      'rb-visit — distinguishes one visit from the next so a session can be counted once. Kept for 30 minutes.',
      'rb-analytics-id — a random identifier with no link to your account, so returning visits are not counted twice. Kept for six months.',
    ],
  },
  { kind: 'heading', text: 'Changing your mind' },
  {
    kind: 'paragraph',
    text:
      'Clear the site data in your browser and the banner will ask again on your next visit. ' +
      'Declining analytics has no effect on anything the site does — every page works identically ' +
      'either way.',
  },
  {
    kind: 'callout',
    title: 'The banking app is separate',
    text:
      'The authenticated app at app.reliancebank.example sets only strictly necessary cookies. It has ' +
      'no analytics and no third-party scripts at all.',
  },
  { kind: 'heading', text: 'Cookies we do not use' },
  {
    kind: 'list',
    items: [
      'Advertising or retargeting cookies of any kind.',
      'Social media pixels or share-button trackers.',
      'Cross-site identifiers, fingerprinting, or session recording.',
    ],
  },
];
