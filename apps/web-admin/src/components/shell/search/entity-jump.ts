/**
 * Pasting an identifier and pressing Enter.
 *
 * Half of what an operator searches for arrives from somewhere else — a ticket, an email
 * from a colleague, a payment reference in a rail exception file — and it is already an
 * exact identifier. Making them wait for a fuzzy search to round-trip and then pick the
 * only result is a small insult repeated a hundred times a day. A recognised id resolves
 * to its screen immediately, before any request is made.
 */

import { ID_PREFIX, PREFIXED_ID_PATTERN, Permission } from '@reliance/contracts';

import type { PermissionSet } from '@/lib/permissions';

/** Where one kind of identifier lives, and what it takes to be allowed there. */
interface JumpTarget {
  /** What the operator is being offered, e.g. `Open customer record`. */
  readonly label: string;
  readonly permission: Permission;
  readonly toPath: (id: string) => string;
}

const TARGETS: Readonly<Record<string, JumpTarget>> = {
  [ID_PREFIX.user]: {
    label: 'Open customer record',
    permission: Permission.CUSTOMER_READ,
    toPath: (id) => `/customers/${id}`,
  },
  [ID_PREFIX.account]: {
    label: 'Open the postings on this account',
    permission: Permission.TRANSACTION_READ,
    toPath: (id) => `/transactions?accountId=${id}`,
  },
  [ID_PREFIX.transaction]: {
    label: 'Open transaction',
    permission: Permission.TRANSACTION_READ,
    toPath: (id) => `/transactions/${id}`,
  },
  [ID_PREFIX.journalEntry]: {
    label: 'Open journal entry',
    permission: Permission.TRANSACTION_READ,
    toPath: (id) => `/transactions?journalEntryId=${id}`,
  },
  [ID_PREFIX.hold]: {
    label: 'Open hold',
    permission: Permission.HOLD_MANAGE,
    toPath: (id) => `/holds?holdId=${id}`,
  },
  [ID_PREFIX.case]: {
    label: 'Open investigation',
    permission: Permission.AML_READ,
    toPath: (id) => `/aml/cases/${id}`,
  },
  [ID_PREFIX.alert]: {
    label: 'Open monitoring alert',
    permission: Permission.AML_READ,
    toPath: (id) => `/aml/alerts?alertId=${id}`,
  },
  [ID_PREFIX.dispute]: {
    label: 'Open dispute',
    permission: Permission.DISPUTE_MANAGE,
    toPath: (id) => `/disputes/${id}`,
  },
  [ID_PREFIX.card]: {
    label: 'Open card',
    permission: Permission.CARD_MANAGE,
    toPath: (id) => `/cards/${id}`,
  },
  [ID_PREFIX.ticket]: {
    label: 'Open ticket',
    permission: Permission.TICKET_MANAGE,
    toPath: (id) => `/support/tickets/${id}`,
  },
  [ID_PREFIX.kycCase]: {
    label: 'Open identity review',
    permission: Permission.KYC_READ,
    toPath: (id) => `/kyc/${id}`,
  },
  [ID_PREFIX.adminUser]: {
    label: 'Open staff account',
    permission: Permission.ADMIN_MANAGE,
    toPath: (id) => `/platform/staff/${id}`,
  },
};

/** A recognised identifier and where it goes. */
export interface EntityJump {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

/**
 * Resolves a typed term to a direct destination.
 *
 * Returns `null` for anything that is not a well-formed identifier of a kind this
 * operator is allowed to open — including a valid id they lack the permission for, which
 * is offered as nothing rather than as a link that will be refused.
 */
export function resolveEntityJump(term: string, permissions: PermissionSet): EntityJump | null {
  const id = term.trim();
  if (!PREFIXED_ID_PATTERN.test(id)) return null;

  const prefix = id.slice(0, id.indexOf('_'));
  const target = TARGETS[prefix];
  if (!target || !permissions.has(target.permission)) return null;

  return { id, label: target.label, path: target.toPath(id) };
}
