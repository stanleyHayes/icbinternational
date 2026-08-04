/**
 * Cache keys for everything the operations screens read.
 *
 * Held in one place so that a mutation can invalidate exactly what it changed. A posting
 * approved on the dual-control queue moves a balance, a trial balance and a transaction
 * list, and a console that refreshes only the screen the operator happens to be on shows
 * them a stale figure the moment they navigate.
 */

/** Namespace for every operations-console query. */
const ROOT = 'ops' as const;

/** Cache keys, one factory per collection. */
export const opsKeys = {
  /**
   * Every key under one collection, for invalidating after a mutation.
   *
   * Deliberately coarse: a posting that has just been approved changes the queue it came
   * from, the feed, and the balances derived from both, and working out precisely which
   * cached filter combinations are affected is a calculation that goes wrong quietly.
   */
  all: (collection: string) => [ROOT, collection] as const,
  /** The customer-facing transaction feed, filtered. */
  transactions: (filters: Readonly<Record<string, string>>) =>
    [ROOT, 'transactions', filters] as const,
  /** The journal — the ledger beneath the feed. */
  journal: (filters: Readonly<Record<string, string>>) => [ROOT, 'journal', filters] as const,
  /** One journal entry with both sides of every posting. */
  journalEntry: (id: string) => [ROOT, 'journal', 'entry', id] as const,
  /** The dual-control queue. */
  approvals: (status: string) => [ROOT, 'approvals', status] as const,
  /** Holds and liens across the book. */
  holds: () => [ROOT, 'holds'] as const,
  /** Cards, for issuing and lifecycle work. */
  cards: () => [ROOT, 'cards'] as const,
  /** The underwriting queue. */
  loanApplications: (status: string) => [ROOT, 'lending', 'applications', status] as const,
  /** Loans behind schedule. */
  arrears: () => [ROOT, 'lending', 'arrears'] as const,
  /** The trial balance, per currency. */
  trialBalance: (currency: string) => [ROOT, 'finance', 'trial-balance', currency] as const,
  /** A financial report over a period. */
  report: (report: string, period: Readonly<Record<string, string>>) =>
    [ROOT, 'finance', 'report', report, period] as const,
  /** Ledger against rail statements. */
  reconciliation: () => [ROOT, 'finance', 'reconciliation'] as const,
  /** The product catalogue, every version. */
  products: () => [ROOT, 'products'] as const,
  /** One product version by code. */
  product: (code: string) => [ROOT, 'products', code] as const,
  /** CMS collections: pages, articles, questions, branches. */
  content: (collection: string) => [ROOT, 'content', collection] as const,
  /** One CMS page with its blocks. */
  contentPage: (id: string) => [ROOT, 'content', 'page', id] as const,
  /** Message templates. */
  templates: () => [ROOT, 'comms', 'templates'] as const,
  /** Campaign sends. */
  campaigns: () => [ROOT, 'comms', 'campaigns'] as const,
  /** Staff accounts. */
  staff: () => [ROOT, 'platform', 'staff'] as const,
  /** Role bundles and the permissions each carries. */
  roles: () => [ROOT, 'platform', 'roles'] as const,
  /** The audit trail, filtered. */
  audit: (filters: Readonly<Record<string, string>>) =>
    [ROOT, 'platform', 'audit', filters] as const,
  /** Feature flags. */
  flags: () => [ROOT, 'platform', 'flags'] as const,
  /** Background job runs. */
  jobs: () => [ROOT, 'platform', 'jobs'] as const,
  /** Compliance and monitoring queues, for the overview's depths. */
  queueDepth: (queue: string) => [ROOT, 'overview', 'depth', queue] as const,
  /** The bank's business date and processing state. */
  processingState: () => [ROOT, 'control', 'state'] as const,
  /** Counterparty rail health and latency. */
  rails: () => [ROOT, 'control', 'rails'] as const,
  /** Restore points. */
  checkpoints: () => [ROOT, 'control', 'checkpoints'] as const,
  /** The published exchange-rate board. */
  rateBoard: () => [ROOT, 'control', 'rates'] as const,
} as const;
