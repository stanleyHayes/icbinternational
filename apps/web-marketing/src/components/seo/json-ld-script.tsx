import type { JsonLdNode } from '@/lib/seo/json-ld';

const ANGLE_BRACKET = /</g;
const ESCAPED_ANGLE_BRACKET = '\\u003c';

/**
 * Renders a JSON-LD graph.
 *
 * The payload is always a graph this site built from its own content — never anything a
 * visitor supplied — and it is serialised, not interpolated. Escaping `<` is the remaining
 * safeguard: an unescaped one inside a `<script>` closes the element early and turns the
 * rest of the graph into markup, so every occurrence becomes its JSON unicode escape,
 * which parses back to the same string.
 */
export function JsonLdScript({ data }: { readonly data: JsonLdNode }) {
  const json = JSON.stringify(data).replace(ANGLE_BRACKET, ESCAPED_ANGLE_BRACKET);

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
