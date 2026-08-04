/** One question and its answer, as a page writes them. */
export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

/**
 * A static list of questions.
 *
 * Native `<details>` again: it opens without JavaScript, the browser's find-in-page reaches
 * inside a closed one, and it needs no `aria-expanded` bookkeeping to get right.
 */
export function FaqList({ entries }: { readonly entries: readonly FaqEntry[] }) {
  return (
    <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
      {entries.map((entry) => (
        <li key={entry.question}>
          <details className="group px-5 py-4">
            <summary className="text-fg cursor-pointer list-none font-medium marker:hidden">
              <span className="flex items-start justify-between gap-4">
                {entry.question}
                <span
                  aria-hidden
                  className="text-fg-subtle mt-1 shrink-0 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="text-fg-muted mt-3 max-w-2xl leading-relaxed">{entry.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
