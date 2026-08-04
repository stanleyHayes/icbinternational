/**
 * Long-form copy, as data rather than markup.
 *
 * Articles, legal documents and help topics are all written as a list of typed blocks.
 * That keeps the renderer honest — every heading becomes a real `<h2>`, every list a real
 * `<ul>` — and it means no page on this site ever has to inject a string as HTML.
 */

/** One block of editorial copy. */
export type ProseBlock =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'subheading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'steps'; readonly items: readonly string[] }
  | { readonly kind: 'callout'; readonly title: string; readonly text: string };

/** A document made of blocks. */
export type Prose = readonly ProseBlock[];
