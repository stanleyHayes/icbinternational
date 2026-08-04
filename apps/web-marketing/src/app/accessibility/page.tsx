import { PageHeader } from '@/components/marketing/page-header';
import { ProseBlocks } from '@/components/marketing/prose-blocks';
import { Section } from '@/components/marketing/section';
import type { Prose } from '@/content/prose';
import { BANK } from '@/content/site';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo/metadata';

const REVIEWED_ON = '2026-07-01';

export const metadata = pageMetadata({
  title: 'Accessibility statement',
  description:
    'How accessible reliancebank.example is, what we know is not yet good enough, what we are doing ' +
    'about it, and how to tell us when something blocks you.',
  path: '/accessibility',
});

const STATEMENT: Prose = [
  {
    kind: 'paragraph',
    text:
      'People move money using screen readers, switch devices, voice control and magnification. ' +
      'This site and the banking app are built so that they can. This statement says how far we ' +
      'have got, in specific terms, and where we still fall short.',
  },
  { kind: 'heading', text: 'How accessible this website is' },
  {
    kind: 'paragraph',
    text:
      'We aim to meet the Web Content Accessibility Guidelines version 2.2 at level AA across ' +
      'every page of reliancebank.example. We believe the site currently meets that standard.',
  },
  {
    kind: 'list',
    items: [
      'Every interactive control is reachable and operable with a keyboard alone, and shows a visible focus ring while it is.',
      'Every form field has a real, persistent label — never a placeholder standing in for one.',
      'Colour is never the only way information is conveyed. A figure that has moved carries a sign and a word as well as a colour.',
      'Text meets a contrast ratio of at least 4.5 to 1, and interface components at least 3 to 1, in both light and dark appearance.',
      'The page reflows to a 320 pixel viewport without a horizontal scrollbar, and text can be enlarged to 200% without loss of content.',
      'Animation is suppressed entirely when your device asks for reduced motion.',
      'Anything that updates on the page — a search result count, a calculator answer, a form outcome — is announced through a live region.',
    ],
  },
  { kind: 'heading', text: 'Where we know we fall short' },
  {
    kind: 'paragraph',
    text:
      'Being specific about this matters more than the claim above. As at the date of this ' +
      'statement:',
  },
  {
    kind: 'list',
    items: [
      'The branch finder’s "use my location" feature depends on a browser permission prompt we do not control, and some assistive technologies announce that prompt poorly. Searching by town or postcode is a complete alternative.',
      'A small number of older PDF statements, produced before 2022, are not tagged for screen readers. Every statement produced since then is, and we will supply an accessible version of any older one on request.',
    ],
  },
  { kind: 'heading', text: 'What we do to keep it that way' },
  {
    kind: 'paragraph',
    text:
      'Accessibility checks run automatically on every change before it can be merged, and the ' +
      'design system every page is built from is tested against the same standard component by ' +
      'component. We commission an independent audit annually and publish what it finds.',
  },
  { kind: 'heading', text: 'Alternative formats' },
  {
    kind: 'paragraph',
    text:
      'Statements, terms and correspondence are available in large print, braille and audio at no ' +
      'charge. Ask in the app, in a branch, or by phone, and we will set it as your default so you ' +
      'never have to ask twice.',
  },
  { kind: 'heading', text: 'Telling us about a problem' },
  {
    kind: 'paragraph',
    text:
      'If something on this site blocks you, we want to know — it is a defect, and we treat it as ' +
      'one. Email accessibility@reliancebank.example or call 020 7946 0100. We acknowledge within two ' +
      'working days and tell you what we are going to do and when.',
  },
  {
    kind: 'callout',
    title: 'If we do not put it right',
    text:
      'The Equality and Human Rights Commission is responsible for enforcing the Equality Act ' +
      '2010. You can contact the Equality Advisory and Support Service if you are unhappy with how ' +
      'we have responded.',
  },
];

/** The accessibility statement. */
export default function AccessibilityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Accessibility statement"
        description={`This statement applies to reliancebank.example, operated by ${BANK.legalName}.`}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      >
        <p className="text-fg-subtle text-sm">
          Prepared and last reviewed {formatDate(REVIEWED_ON)}.
        </p>
      </PageHeader>

      <Section>
        <ProseBlocks blocks={STATEMENT} />
      </Section>
    </>
  );
}
