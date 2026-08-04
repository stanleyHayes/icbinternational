import Link from 'next/link';

import { cn, FOCUS_RING } from '@reliance/ui';

import { NewsletterForm } from '@/components/forms/newsletter-form';
import { FOOTER_GROUPS, LEGAL_LINKS } from '@/content/navigation';
import { BANK } from '@/content/site';

import { FooterContact } from './footer-contact';
import { Logo } from './logo';

/** The year the site was last published. Fixed so the server and the browser agree. */
const FOOTER_YEAR = 2026;

/** The footer. Real link groups, the regulatory statement, and one place to subscribe. */
export function SiteFooter() {
  return (
    <footer className="border-border bg-surface border-t">
      <div className="rb-shell py-14">
        <div className="grid gap-12 lg:grid-cols-[20rem_1fr]">
          <div>
            <Logo height={34} decorative />
            <p className="text-fg-muted mt-4 max-w-xs text-sm leading-relaxed">{BANK.tagline}</p>
            <NewsletterForm />
          </div>
          <FooterLinks />
        </div>

        <FooterContact />
        <FooterLegal />
      </div>
    </footer>
  );
}

function FooterLinks() {
  return (
    <nav aria-label="Footer" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
      {FOOTER_GROUPS.map((group) => (
        <div key={group.title}>
          <h2 className="text-fg text-xs font-semibold tracking-widest uppercase">{group.title}</h2>
          <ul className="mt-3 space-y-2">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    'text-fg-muted hover:text-fg rounded-sm text-sm transition-colors',
                    FOCUS_RING,
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function FooterLegal() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
      <p className="text-fg-subtle text-xs">
        © {FOOTER_YEAR} {BANK.legalName}
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {LEGAL_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={cn('text-fg-subtle hover:text-fg rounded-sm text-xs', FOCUS_RING)}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
