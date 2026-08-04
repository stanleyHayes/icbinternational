'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Faq } from '@reliance/contracts';
import { cn, EmptyState, FormField, Input } from '@reliance/ui';

import { FaqAccordion } from './faq-accordion';

const ICON_SIZE = 18;

const ALL_TOPICS = 'All topics';

function matches(faq: Faq, needle: string, category: string): boolean {
  const inCategory = category === ALL_TOPICS || faq.category === category;
  const hit = needle.length === 0 || `${faq.question} ${faq.answer}`.toLowerCase().includes(needle);
  return inCategory && hit;
}

/**
 * The help centre's search.
 *
 * Filtering happens in the browser over the whole set, which is small enough to ship. That
 * makes it instant and, more importantly, makes it work when the customer is on a train:
 * the page they already loaded still answers their question.
 */
export function FaqSearch({ faqs }: { readonly faqs: readonly Faq[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL_TOPICS);

  const categories = useMemo(
    () => [ALL_TOPICS, ...new Set(faqs.map((faq) => faq.category))],
    [faqs],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return faqs.filter((faq) => matches(faq, needle, category));
  }, [faqs, query, category]);

  return (
    <div>
      <FormField label="Search our answers" className="max-w-xl">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Search size={ICON_SIZE} aria-hidden />}
          placeholder="Lost card, transfer times, changing address…"
          inputSize="lg"
        />
      </FormField>

      <TopicFilter categories={categories} selected={category} onSelect={setCategory} />

      <p aria-live="polite" className="text-fg-muted mt-6 text-sm">
        {results.length === 1 ? '1 answer' : `${String(results.length)} answers`}
      </p>

      {results.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="We have not written that one up yet"
          description="Try a different word, or message us and a real person will answer within a working day."
        />
      ) : (
        <FaqAccordion faqs={results} />
      )}
    </div>
  );
}

function TopicFilter({
  categories,
  selected,
  onSelect,
}: {
  readonly categories: readonly string[];
  readonly selected: string;
  readonly onSelect: (category: string) => void;
}) {
  return (
    <div className="mt-6">
      <h2 className="sr-only">Filter by topic</h2>
      <ul className="flex flex-wrap gap-2">
        {categories.map((name) => (
          <li key={name}>
            <button
              type="button"
              aria-pressed={selected === name}
              onClick={() => onSelect(name)}
              className={cn(
                'rounded-pill border px-3 py-1.5 text-sm transition-colors duration-(--rb-duration-fast)',
                selected === name
                  ? 'border-accent bg-accent-soft text-accent font-medium'
                  : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
