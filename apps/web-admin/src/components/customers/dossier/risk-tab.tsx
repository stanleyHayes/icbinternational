/**
 * Why this customer is or is not a problem.
 *
 * Four separate records answer that — the identity case, list screening, transaction
 * monitoring and any open investigation — and an agent who has to visit four queues to
 * assemble them will not. They are on one panel here, each linking to the workstation
 * where it can actually be decided, because reading risk and deciding risk are different
 * jobs and mixing them is how a support agent ends up closing an alert.
 */

'use client';

import Link from 'next/link';

import { Badge, cn, EmptyState, FOCUS_RING, StatusPill } from '@reliance/ui';

import {
  alertTone,
  caseTone,
  kycTone,
  MatchScore,
  QueueError,
  QueueLoading,
  ScreenPanel,
  screeningTone,
  severityTone,
} from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';
import { href } from '@/lib/routes';

import { useCustomerRisk, type CustomerRisk } from '../data/use-customer-risk';

const LINK = 'font-body text-sm text-accent underline-offset-2 hover:underline';
const ROW =
  'flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0';

function Row({ children }: Readonly<{ children: React.ReactNode }>) {
  return <li className={ROW}>{children}</li>;
}

function IdentitySection({ risk }: Readonly<{ risk: CustomerRisk }>) {
  if (risk.kycCases.length === 0) {
    return (
      <EmptyState
        title="No identity case on file"
        description="This customer has not started verification, so they are limited to tier 0."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {risk.kycCases.map((record) => (
        <Row key={record.id}>
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={kycTone(record.status)} label={humaniseCode(record.status)} />
            <span className="font-body text-fg text-sm">
              Tier {record.currentTier} held, tier {record.requestedTier} requested
            </span>
            {record.riskRating && <Badge>{humaniseCode(record.riskRating)} risk</Badge>}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-fg-muted font-mono text-xs">
              {formatInstant(record.updatedAt)}
            </span>
            <Link href={href('/kyc')} className={cn(LINK, FOCUS_RING)}>
              Open in identity review
            </Link>
          </span>
        </Row>
      ))}
    </ul>
  );
}

function ScreeningSection({ risk }: Readonly<{ risk: CustomerRisk }>) {
  if (risk.screeningHits.length === 0) {
    return (
      <EmptyState
        title="No list matches"
        description="This customer has been screened against every list we hold and matched none of them."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {risk.screeningHits.map((hit) => (
        <Row key={hit.id}>
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={screeningTone(hit.status)} label={humaniseCode(hit.status)} />
            <span className="font-body text-fg text-sm">
              {hit.listName} — {hit.matchedName}
            </span>
            <Badge>{humaniseCode(hit.matchType)}</Badge>
          </span>
          <span className="flex items-center gap-3">
            <MatchScore score={hit.matchScore} compact />
            <Link href={href('/screening')} className={cn(LINK, FOCUS_RING)}>
              Open in screening
            </Link>
          </span>
        </Row>
      ))}
    </ul>
  );
}

function AlertRow({ alert }: Readonly<{ alert: CustomerRisk['alerts'][number] }>) {
  return (
    <Row>
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill tone={alertTone(alert.status)} label={humaniseCode(alert.status)} />
        <Badge tone={severityTone(alert.severity)}>{humaniseCode(alert.severity)}</Badge>
        <span className="font-body text-fg text-sm">{alert.ruleName}</span>
        <span className="font-body text-fg-muted text-xs">{alert.summary}</span>
      </span>
      <Link href={href('/aml/alerts')} className={cn(LINK, FOCUS_RING)}>
        Open in monitoring
      </Link>
    </Row>
  );
}

function MonitoringSection({ risk }: Readonly<{ risk: CustomerRisk }>) {
  if (risk.alerts.length === 0 && risk.cases.length === 0) {
    return (
      <EmptyState
        title="Nothing has been flagged"
        description="No monitoring rule has fired against this customer and no investigation is open."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {risk.alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}
      {risk.cases.map((investigation) => (
        <Row key={investigation.id}>
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={caseTone(investigation.status)}
              label={humaniseCode(investigation.status)}
            />
            <span className="font-body text-fg text-sm">
              Investigation {investigation.reference}
            </span>
          </span>
          <Link href={href('/aml/cases')} className={cn(LINK, FOCUS_RING)}>
            Open the investigation
          </Link>
        </Row>
      ))}
    </ul>
  );
}

/** Identity, screening and monitoring records naming this customer. */
export function RiskTab({ customerId }: Readonly<{ customerId: string }>) {
  const risk = useCustomerRisk(customerId);

  if (risk.isPending) return <QueueLoading label="risk records" />;
  if (risk.isError) {
    return (
      <QueueError
        error={risk.error}
        subject="this customer's risk records"
        onRetry={risk.refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenPanel title="Identity verification">
        <IdentitySection risk={risk.data} />
      </ScreenPanel>
      <ScreenPanel title="List screening">
        <ScreeningSection risk={risk.data} />
      </ScreenPanel>
      <ScreenPanel title="Transaction monitoring">
        <MonitoringSection risk={risk.data} />
      </ScreenPanel>
    </div>
  );
}
