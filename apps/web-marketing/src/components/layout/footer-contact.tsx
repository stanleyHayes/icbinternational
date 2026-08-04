import { cn, FOCUS_RING } from '@reliance/ui';

import { BANK, REGULATORY_STATEMENT } from '@/content/site';

const LINK_CLASS = 'rounded-sm hover:text-fg';

/** The contact row, the regulatory statement and the copyright line. */
export function FooterContact() {
  return (
    <div className="border-border mt-12 border-t pt-8">
      <dl className="grid gap-6 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-fg font-medium">General enquiries</dt>
          <dd className="text-fg-muted mt-1">
            <a href={`tel:${BANK.phone}`} className={cn(LINK_CLASS, FOCUS_RING)}>
              {BANK.phoneDisplay}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-fg font-medium">Lost or stolen card</dt>
          <dd className="text-fg-muted mt-1">
            <a href={`tel:${BANK.lostCardPhone}`} className={cn(LINK_CLASS, FOCUS_RING)}>
              {BANK.lostCardDisplay}
            </a>{' '}
            — 24 hours a day
          </dd>
        </div>
        <div>
          <dt className="text-fg font-medium">Registered office</dt>
          <dd className="text-fg-muted mt-1">
            {BANK.registeredOffice.street}, {BANK.registeredOffice.locality}{' '}
            {BANK.registeredOffice.postalCode}
          </dd>
        </div>
      </dl>

      <p className="text-fg-subtle mt-8 max-w-4xl text-xs leading-relaxed">
        {REGULATORY_STATEMENT}
      </p>
    </div>
  );
}
