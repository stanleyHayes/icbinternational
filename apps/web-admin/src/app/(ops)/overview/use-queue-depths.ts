/**
 * How much work is waiting, and where.
 *
 * Each queue is read separately and only when the operator is allowed to see it: an
 * operations manager with no compliance permission should get a shorter list, not a row
 * of refusals. A queue whose count the platform declines to total falls back to the rows
 * it did return, which is honest — the number is then a floor, and the screen says so.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import {
  AlertStatus,
  ApprovalStatus,
  KycStatus,
  LoanApplicationStatus,
  Permission,
  type PageInfo,
} from '@reliance/contracts';

import { opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { usePermissions } from '@/lib/permissions';

/** How long a queue depth is trusted before it is re-read. */
const DEPTH_STALE_MS = 30_000;

/**
 * Rows requested from the ticket queue, which the platform does not total.
 *
 * Deep enough that the tile reads "50+" rather than a small number that looks precise
 * and is not.
 */
const TICKET_SAMPLE = 50;

/** A queue whose depth the overview reports. */
interface QueueSpec {
  readonly id: string;
  readonly label: string;
  /** What clearing this queue means, so an unfamiliar operator knows what they are seeing. */
  readonly description: string;
  readonly path: string;
  readonly requires: Permission;
}

/** The queues, in the order an operations manager checks them. */
const QUEUES: readonly QueueSpec[] = [
  {
    id: 'approvals',
    label: 'Awaiting a second approver',
    description: 'Manual postings, reversals and overrides a colleague has raised.',
    path: '/approvals',
    requires: Permission.POSTING_APPROVE,
  },
  {
    id: 'holds',
    label: 'Funds held',
    description: 'Liens and freezes reducing an available balance right now.',
    path: '/holds',
    requires: Permission.HOLD_MANAGE,
  },
  {
    id: 'identity',
    label: 'Identity reviews',
    description: 'Customers whose verification is sitting with a reviewer.',
    path: '/kyc',
    requires: Permission.KYC_READ,
  },
  {
    id: 'monitoring',
    label: 'Monitoring alerts',
    description: 'Transaction-monitoring alerts nobody has triaged yet.',
    path: '/aml/alerts',
    requires: Permission.AML_READ,
  },
  {
    id: 'underwriting',
    label: 'Applications to underwrite',
    description: 'Lending applications waiting on an underwriting decision.',
    path: '/lending/applications',
    requires: Permission.LOAN_DECIDE,
  },
  {
    id: 'tickets',
    label: 'Open customer tickets',
    description: 'Customer conversations still open with an agent.',
    path: '/support/tickets',
    requires: Permission.TICKET_MANAGE,
  },
];

/** One queue and how deep it currently is. */
export interface QueueDepth extends QueueSpec {
  /** `null` while the count is still being read, or when the operator may not see it. */
  readonly count: number | null;
  /** True when the platform did not total the queue, so the count is a floor. */
  readonly isFloor: boolean;
}

interface Listed {
  readonly data: readonly unknown[];
  readonly page: PageInfo;
}

/** Reads one queue's depth, or nothing at all when the operator may not see it. */
function useDepth(id: string, enabled: boolean, load: (signal: AbortSignal) => Promise<Listed>) {
  const { data } = useQuery({
    queryKey: opsKeys.queueDepth(id),
    queryFn: async ({ signal }) => load(signal),
    enabled,
    staleTime: DEPTH_STALE_MS,
  });

  if (!data) return { count: null, isFloor: false };
  if (data.page.total === undefined) return { count: data.data.length, isFloor: true };
  return { count: data.page.total, isFloor: false };
}

type Depths = Readonly<Record<string, { count: number | null; isFloor: boolean }>>;

/** Every queue the operator is allowed to see, with its current depth. */
export function useQueueDepths(): readonly QueueDepth[] {
  const client = useApiClient();
  const permissions = usePermissions();
  const allows = (permission: Permission): boolean => permissions.has(permission);

  const depths: Depths = {
    approvals: useDepth('approvals', allows(Permission.POSTING_APPROVE), (signal) =>
      client.admin.approvals({ status: ApprovalStatus.PENDING }, { signal }),
    ),
    holds: useDepth('holds', allows(Permission.HOLD_MANAGE), (signal) =>
      client.admin.holds({ limit: 1 }, { signal }),
    ),
    identity: useDepth('identity', allows(Permission.KYC_READ), (signal) =>
      client.admin.kycQueue({ status: KycStatus.UNDER_REVIEW }, { signal }),
    ),
    monitoring: useDepth('monitoring', allows(Permission.AML_READ), (signal) =>
      client.admin.amlAlerts({ status: AlertStatus.OPEN }, { signal }),
    ),
    underwriting: useDepth('underwriting', allows(Permission.LOAN_DECIDE), (signal) =>
      client.admin.loanApplications({ status: LoanApplicationStatus.UNDER_REVIEW }, { signal }),
    ),
    tickets: useDepth('tickets', allows(Permission.TICKET_MANAGE), (signal) =>
      client.admin.tickets({ limit: TICKET_SAMPLE }, { signal }),
    ),
  };

  return QUEUES.filter((queue) => allows(queue.requires)).map((queue) => ({
    ...queue,
    count: depths[queue.id]?.count ?? null,
    isFloor: depths[queue.id]?.isFloor ?? false,
  }));
}
