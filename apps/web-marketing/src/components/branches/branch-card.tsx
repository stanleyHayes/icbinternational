import { Accessibility, Banknote, MapPin, Phone } from 'lucide-react';

import { LocationKind, type BankLocation } from '@reliance/contracts';
import { Badge } from '@reliance/ui';

import { formatDistance, formatPhone } from '@/lib/format';

const ICON_SIZE = 15;

const KIND_LABEL: Readonly<Record<LocationKind, string>> = {
  [LocationKind.BRANCH]: 'Branch',
  [LocationKind.ATM]: 'Cash machine',
  [LocationKind.BOTH]: 'Branch and cash machine',
};

/** Weekday hours, collapsed to the range that actually varies. */
function hoursSummary(location: BankLocation): string {
  const open = location.openingHours.filter((day) => day.opens !== null && day.closes !== null);
  const first = open[0];
  if (!first?.opens || !first.closes) return 'Open 24 hours';

  const closedDays = location.openingHours.length - open.length;
  const suffix = closedDays > 0 ? ', closed Sunday' : '';
  return `${first.opens}–${first.closes}${suffix}`;
}

/** One branch or cash machine in the finder's results list. */
export function BranchCard({ location }: { readonly location: BankLocation }) {
  return (
    <li className="border-border bg-surface rounded-xl border p-5">
      <BranchHeading location={location} />
      <BranchDetails location={location} />
      <BranchServices location={location} />
    </li>
  );
}

function BranchHeading({ location }: { readonly location: BankLocation }) {
  const isAtm = location.kind === LocationKind.ATM;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-fg text-lg font-semibold">{location.name}</h3>
        <p className="text-fg-muted mt-1 flex items-start gap-1.5 text-sm">
          <MapPin size={ICON_SIZE} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {location.addressLine}, {location.city} {location.postalCode}
          </span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge tone={isAtm ? 'neutral' : 'accent'}>{KIND_LABEL[location.kind]}</Badge>
        {location.distanceMetres === null ? null : (
          <span className="text-fg text-sm font-medium">
            {formatDistance(location.distanceMetres)} away
          </span>
        )}
      </div>
    </div>
  );
}

function BranchDetails({ location }: { readonly location: BankLocation }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-fg-subtle">Opening hours</dt>
        <dd className="text-fg mt-0.5">{hoursSummary(location)}</dd>
      </div>
      {location.phone ? (
        <div>
          <dt className="text-fg-subtle">Phone</dt>
          <dd className="mt-0.5">
            <a
              href={`tel:${location.phone}`}
              className="text-fg hover:text-accent inline-flex items-center gap-1.5"
            >
              <Phone size={ICON_SIZE} aria-hidden />
              {/* href keeps E.164 so the dialler gets an unambiguous number; the text is
                  the form printed on the branch door. */}
              {formatPhone(location.phone)}
            </a>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function BranchServices({ location }: { readonly location: BankLocation }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {location.services.map((service) => (
        <li key={service}>
          <Badge tone="neutral" size="sm">
            {service}
          </Badge>
        </li>
      ))}
      {location.hasDepositMachine ? (
        <li>
          <Badge tone="neutral" size="sm">
            <Banknote size={ICON_SIZE} aria-hidden /> Deposit machine
          </Badge>
        </li>
      ) : null}
      {location.wheelchairAccessible ? (
        <li>
          <Badge tone="success" size="sm">
            <Accessibility size={ICON_SIZE} aria-hidden /> Step-free access
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}
