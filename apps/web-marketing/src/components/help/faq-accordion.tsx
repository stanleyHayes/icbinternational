import type { Faq } from '@reliance/contracts';

/**
 * The answers, as native `<details>` elements.
 *
 * `<details>` opens without JavaScript, the browser's own find-in-page reaches inside a
 * closed one, and it needs no `aria-expanded` bookkeeping to get right — three things a
 * hand-built accordion has to earn back.
 */
export function FaqAccordion({ faqs }: { readonly faqs: readonly Faq[] }) {
  return (
    <ul className="divide-border border-border bg-surface mt-4 divide-y rounded-xl border">
      {faqs.map((faq) => (
        <li key={faq.id}>
          <details className="group px-5 py-4">
            <summary className="text-fg cursor-pointer list-none font-medium marker:hidden">
              <span className="flex items-start justify-between gap-4">
                {faq.question}
                <span
                  aria-hidden
                  className="text-fg-subtle mt-1 shrink-0 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="text-fg-muted mt-3 max-w-2xl leading-relaxed">{faq.answer}</p>
            <p className="text-fg-subtle mt-2 text-xs">{faq.category}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
