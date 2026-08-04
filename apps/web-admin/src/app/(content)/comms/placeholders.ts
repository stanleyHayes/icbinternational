/**
 * Checking a message template before it goes to a hundred thousand people.
 *
 * Two failures matter and both are silent. A placeholder the template uses but the engine
 * does not supply renders as literal braces in the customer's inbox; a placeholder the
 * engine supplies but the template never uses is usually a sign the wrong template is
 * about to be sent. Both are found here, before the send rather than after it.
 */

/** How a placeholder is written in a template body. */
const PLACEHOLDER = /\{\{\s*([A-Za-z][\w.]*)\s*\}\}/g;

/** Every placeholder the body actually uses, in the order it first uses them. */
export function placeholdersIn(body: string): readonly string[] {
  const found: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

/** What is wrong with a template's placeholders, if anything. */
export interface PlaceholderReport {
  /** Used in the body but not declared, so the customer would see the braces. */
  readonly undeclared: readonly string[];
  /** Declared but never used. Usually the wrong template rather than a harmless extra. */
  readonly unused: readonly string[];
  readonly ok: boolean;
}

/** Compares what the body uses against what the template declares. */
export function checkPlaceholders(body: string, declared: readonly string[]): PlaceholderReport {
  const used = placeholdersIn(body);
  const undeclared = used.filter((name) => !declared.includes(name));
  const unused = declared.filter((name) => !used.includes(name));

  return { undeclared, unused, ok: undeclared.length === 0 && unused.length === 0 };
}

/** Sample values used to render a preview, so a template can be read as a person would. */
const SAMPLES: Readonly<Record<string, string>> = {
  firstName: 'Amara',
  lastName: 'Boateng',
  fullName: 'Amara Boateng',
  amount: '£248.60',
  currency: 'GBP',
  accountName: 'Everyday Account',
  accountNumberMasked: '••••4417',
  merchantName: 'Northern Rail',
  balance: '£1,942.08',
  reference: 'RB-4K2M-9QX1',
  date: '3 August 2026',
  cardLast4: '4417',
  payeeName: 'Ola Adeyemi',
  branchName: 'Leeds City',
};

/** A stand-in value for a placeholder the sample set does not know. */
function sampleFor(name: string): string {
  return SAMPLES[name] ?? `[${name}]`;
}

/** The template body with sample values substituted, as the customer would read it. */
export function renderPreview(body: string): string {
  return body.replaceAll(PLACEHOLDER, (_, name: string) => sampleFor(name));
}
