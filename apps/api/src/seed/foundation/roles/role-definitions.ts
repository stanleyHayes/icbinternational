import { AdminRole, Permission } from '@reliance/contracts';

/**
 * The ten staff roles and what each may do.
 *
 * Three principles shape the bundles.
 *
 * **Least privilege by default.** A role gets the permissions its job needs and nothing
 * adjacent. A KYC analyst can decide a case but cannot freeze an account, because freezing
 * is a fraud decision with a different escalation path and a different audit expectation.
 *
 * **Read and decide are separate permissions.** `AML_READ` without `AML_DECIDE` is a real
 * and common configuration — an analyst who investigates and recommends, and a senior who
 * dispositions. Collapsing them would force every investigator to be an approver.
 *
 * **Nobody but the super admin manages the estate.** `ADMIN_MANAGE`, `PRODUCT_WRITE`,
 * `FLAG_WRITE` and `SIMULATION_RUN` change what the bank *is* rather than what it did
 * today, and each is a plausible route to privilege escalation if handed out broadly.
 */

/** A role and the permission bundle it carries. */
export interface RoleDefinition {
  readonly role: AdminRole;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
}

/** Every permission in the contract. Only the super admin holds all of them. */
export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(Object.values(Permission));

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = Object.freeze([
  {
    role: AdminRole.SUPER_ADMIN,
    name: 'Super administrator',
    description:
      'Unrestricted access, including staff management and operations control. ' +
      'Intended for a very small number of named individuals.',
    permissions: ALL_PERMISSIONS,
  },
  {
    role: AdminRole.COMPLIANCE_OFFICER,
    name: 'Compliance officer',
    description:
      'Owns financial-crime outcomes: dispositions AML cases, tunes the rule set, and can ' +
      'restrict a customer. Reads everything, moves no money.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.CUSTOMER_FREEZE,
      Permission.KYC_READ,
      Permission.KYC_DECIDE,
      Permission.TRANSACTION_READ,
      Permission.AML_READ,
      Permission.AML_DECIDE,
      Permission.AML_RULE_WRITE,
      Permission.DISPUTE_MANAGE,
      Permission.REPORT_READ,
      Permission.AUDIT_READ,
    ],
  },
  {
    role: AdminRole.KYC_ANALYST,
    name: 'KYC analyst',
    description:
      'Works the onboarding queue: reviews documents, verifies identity and sets the ' +
      'customer tier. Sees AML context but does not disposition it.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.KYC_READ,
      Permission.KYC_DECIDE,
      Permission.AML_READ,
    ],
  },
  {
    role: AdminRole.FRAUD_ANALYST,
    name: 'Fraud analyst',
    description:
      'Responds to live fraud: freezes accounts and cards, places holds, and tunes the ' +
      'fraud rules. Cannot reverse a transaction — that needs operations and an approver.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.CUSTOMER_FREEZE,
      Permission.TRANSACTION_READ,
      Permission.HOLD_MANAGE,
      Permission.CARD_MANAGE,
      Permission.FRAUD_MANAGE,
      Permission.AML_READ,
      Permission.DISPUTE_MANAGE,
    ],
  },
  {
    role: AdminRole.OPERATIONS,
    name: 'Operations',
    description:
      'Runs the day: fixes customer records, initiates corrections and reversals, manages ' +
      'holds and cards. Initiates postings but never approves one.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.CUSTOMER_WRITE,
      Permission.TRANSACTION_READ,
      Permission.TRANSACTION_REVERSE,
      Permission.POSTING_INITIATE,
      Permission.HOLD_MANAGE,
      Permission.CARD_MANAGE,
      Permission.TICKET_MANAGE,
      Permission.JOB_MANAGE,
      Permission.REPORT_READ,
    ],
  },
  {
    role: AdminRole.TREASURY,
    name: 'Treasury',
    description:
      'Owns the general ledger: approves manual postings and reads every financial report. ' +
      'Holds both posting permissions because the desk is staffed by more than one person ' +
      'and the API refuses a self-approval regardless of role.',
    permissions: [
      Permission.TRANSACTION_READ,
      Permission.POSTING_INITIATE,
      Permission.POSTING_APPROVE,
      Permission.REPORT_READ,
      Permission.AUDIT_READ,
    ],
  },
  {
    role: AdminRole.UNDERWRITER,
    name: 'Underwriter',
    description:
      'Decides lending: reads the application, the affordability evidence and the account ' +
      'history, and approves or declines. No access to money movement.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.KYC_READ,
      Permission.TRANSACTION_READ,
      Permission.LOAN_DECIDE,
      Permission.REPORT_READ,
    ],
  },
  {
    role: AdminRole.SUPPORT_AGENT,
    name: 'Support agent',
    description:
      'Answers customers: reads accounts, manages tickets and disputes, and can view the ' +
      'app as the customer sees it. Impersonation is read-only and always audited.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.CUSTOMER_IMPERSONATE,
      Permission.TRANSACTION_READ,
      Permission.TICKET_MANAGE,
      Permission.DISPUTE_MANAGE,
      Permission.CARD_MANAGE,
    ],
  },
  {
    role: AdminRole.CONTENT_EDITOR,
    name: 'Content editor',
    description:
      'Writes and publishes the marketing site, help centre and customer communications. ' +
      'No access to any customer record.',
    permissions: [Permission.CONTENT_WRITE, Permission.CONTENT_PUBLISH, Permission.COMMS_SEND],
  },
  {
    role: AdminRole.AUDITOR,
    name: 'Auditor',
    description:
      'Reads everything and changes nothing, including the hash-chained audit log itself. ' +
      'Deliberately holds no permission ending in write, decide or manage.',
    permissions: [
      Permission.CUSTOMER_READ,
      Permission.KYC_READ,
      Permission.TRANSACTION_READ,
      Permission.AML_READ,
      Permission.REPORT_READ,
      Permission.AUDIT_READ,
    ],
  },
]);
