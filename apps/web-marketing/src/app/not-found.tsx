import { LinkButton } from '@/components/marketing/link-button';
import { HELP_TOPICS } from '@/content/help-topics';
import { BANK } from '@/content/site';

/**
 * The 404.
 *
 * It offers somewhere to go rather than apologising twice. A dead end on a bank's website
 * is where a customer decides to phone instead, so the phone number is here too.
 */
export default function NotFound() {
  return (
    <div className="rb-shell py-24 md:py-32">
      <p className="text-accent text-xs font-semibold tracking-widest uppercase">Page not found</p>
      <h1 className="font-display text-fg mt-3 max-w-2xl text-4xl font-semibold md:text-5xl">
        We could not find that page
      </h1>
      <p className="text-fg-muted mt-5 max-w-xl text-lg leading-relaxed">
        The address may have changed, or the link that brought you here may be out of date. Nothing
        is wrong with your account.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href="/" size="lg">
          Go to the home page
        </LinkButton>
        <LinkButton href="/help" size="lg" variant="secondary">
          Search the help centre
        </LinkButton>
      </div>

      <nav aria-label="Popular pages" className="mt-14">
        <h2 className="text-fg text-sm font-semibold">You might be looking for</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.href}>
              <LinkButton href={topic.href} variant="secondary" fullWidth>
                {topic.title}
              </LinkButton>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-fg-muted mt-12 text-sm">
        Still stuck? Call us on{' '}
        <a href={`tel:${BANK.phone}`} className="text-accent font-medium">
          {BANK.phoneDisplay}
        </a>
        , seven days a week.
      </p>
    </div>
  );
}
