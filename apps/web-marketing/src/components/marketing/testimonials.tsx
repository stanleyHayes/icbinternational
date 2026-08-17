import { RevealGroup } from '@/components/motion/reveal-group';
import { TESTIMONIALS } from '@/content/testimonials';
import type { Testimonial } from '@/content/testimonials';

import { Section, SectionHeading } from './section';

/** One quote. The `<li>` around it is the reveal wrapper. */
function TestimonialCard({ testimonial }: { readonly testimonial: Testimonial }) {
  return (
    <figure className="border-border bg-surface flex h-full flex-col rounded-xl border p-6">
      <blockquote className="text-fg grow text-lg leading-relaxed">
        <p>“{testimonial.quote}”</p>
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span
          aria-hidden
          className="rounded-pill bg-accent-soft text-accent grid size-9 shrink-0 place-items-center text-sm font-semibold"
        >
          {testimonial.initials}
        </span>
        <span>
          <span className="text-fg block text-sm font-medium">{testimonial.name}</span>
          <span className="text-fg-muted block text-sm">{testimonial.context}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** What customers say. Real names, real products, no stars out of five. */
export function Testimonials() {
  return (
    <Section labelledBy="testimonials-heading">
      <SectionHeading
        id="testimonials-heading"
        eyebrow="Customers"
        title="What people say once they have switched"
        description="Four accounts, four cities, four different reasons for moving."
      />

      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        <RevealGroup as="li">
          {TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.name} testimonial={testimonial} />
          ))}
        </RevealGroup>
      </ul>
    </Section>
  );
}
