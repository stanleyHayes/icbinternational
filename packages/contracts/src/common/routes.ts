/**
 * The complete route map.
 *
 * Paths live here rather than being typed as string literals at each call site, so a
 * rename is a compile error in every consumer instead of a 404 discovered in production.
 * Functions take path parameters; constants are static paths.
 */

export const API_VERSION = 'v1';
export const API_PREFIX = `/${API_VERSION}` as const;

/** Header carrying the replay-protection key on every mutating money endpoint. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
/** Header echoing the request trace id, present on every response. */
export const TRACE_HEADER = 'x-trace-id';
/** Double-submit CSRF token header, paired with the `rb.csrf` cookie. */
export const CSRF_HEADER = 'x-csrf-token';
/** Proof of a recent step-up authentication, required by `🔐` routes. */
export const STEP_UP_HEADER = 'x-step-up-token';

export const COOKIE = {
  accessToken: 'rb.at',
  refreshToken: 'rb.rt',
  csrf: 'rb.csrf',
  deviceId: 'rb.did',
} as const;

export const routes = {
  auth: {
    register: '/auth/register',
    verifyEmail: '/auth/verify-email',
    resendVerification: '/auth/resend-verification',
    login: '/auth/login',
    mfaVerify: '/auth/mfa/verify',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    changePassword: '/auth/change-password',
    me: '/auth/me',
    stepUp: '/auth/step-up',
  },

  mfa: {
    totpEnrol: '/mfa/totp/enrol',
    totpConfirm: '/mfa/totp/confirm',
    totpDisable: '/mfa/totp',
    recoveryCodes: '/mfa/recovery-codes',
    passkeyRegisterOptions: '/mfa/passkeys/register/options',
    passkeyRegisterVerify: '/mfa/passkeys/register/verify',
    passkeyAuthOptions: '/mfa/passkeys/authenticate/options',
    passkeyAuthVerify: '/mfa/passkeys/authenticate/verify',
    passkey: (id: string) => `/mfa/passkeys/${id}`,
  },

  devices: {
    list: '/devices',
    byId: (id: string) => `/devices/${id}`,
    sessions: '/sessions',
    session: (id: string) => `/sessions/${id}`,
    revokeAllSessions: '/sessions/revoke-all',
  },

  profile: {
    get: '/profile',
    update: '/profile',
    exportData: '/profile/export',
    closeAccount: '/profile/close',
  },

  kyc: {
    start: '/kyc/start',
    status: '/kyc/status',
    step: (step: string) => `/kyc/steps/${step}`,
    documents: '/kyc/documents',
    document: (id: string) => `/kyc/documents/${id}`,
    submit: '/kyc/submit',
    uploadSignature: '/kyc/documents/upload-signature',
  },

  accounts: {
    list: '/accounts',
    create: '/accounts',
    byId: (id: string) => `/accounts/${id}`,
    balance: (id: string) => `/accounts/${id}/balance`,
    close: (id: string) => `/accounts/${id}/close`,
    netWorth: '/accounts/net-worth',
    statements: (id: string) => `/accounts/${id}/statements`,
    statement: (accountId: string, statementId: string) =>
      `/accounts/${accountId}/statements/${statementId}`,
    letters: '/accounts/letters',
  },

  transactions: {
    list: '/transactions',
    byId: (id: string) => `/transactions/${id}`,
    update: (id: string) => `/transactions/${id}`,
    /** Returns a rendered document, not JSON. Check `Content-Type` before parsing. */
    receipt: (id: string) => `/transactions/${id}/receipt`,
    export: '/transactions/export',
  },

  insights: {
    spend: '/insights/spend',
    cashflow: '/insights/cashflow',
    subscriptions: '/insights/subscriptions',
    budgets: '/insights/budgets',
    budget: (id: string) => `/insights/budgets/${id}`,
  },

  transfers: {
    quote: '/transfers/quote',
    create: '/transfers',
    list: '/transfers',
    byId: (id: string) => `/transfers/${id}`,
    cancel: (id: string) => `/transfers/${id}/cancel`,
  },

  beneficiaries: {
    list: '/beneficiaries',
    create: '/beneficiaries',
    byId: (id: string) => `/beneficiaries/${id}`,
    verifyName: '/beneficiaries/verify-name',
  },

  transferOrders: {
    list: '/transfer-orders',
    create: '/transfer-orders',
    byId: (id: string) => `/transfer-orders/${id}`,
    skip: (id: string) => `/transfer-orders/${id}/skip`,
    pause: (id: string) => `/transfer-orders/${id}/pause`,
  },

  bulkTransfers: {
    create: '/bulk-transfers',
    byId: (id: string) => `/bulk-transfers/${id}`,
    approve: (id: string) => `/bulk-transfers/${id}/approve`,
  },

  payments: {
    billers: '/billers',
    biller: (id: string) => `/billers/${id}`,
    billPayments: '/bill-payments',
    billPayment: (id: string) => `/bill-payments/${id}`,
    topUps: '/topups',
    requests: '/payment-requests',
    request: (id: string) => `/payment-requests/${id}`,
    payRequest: (id: string) => `/payment-requests/${id}/pay`,
    splitBill: '/payment-requests/split',
    mandates: '/mandates',
    mandate: (id: string) => `/mandates/${id}`,
  },

  cards: {
    list: '/cards',
    create: '/cards',
    byId: (id: string) => `/cards/${id}`,
    activate: (id: string) => `/cards/${id}/activate`,
    freeze: (id: string) => `/cards/${id}/freeze`,
    unfreeze: (id: string) => `/cards/${id}/unfreeze`,
    sensitive: (id: string) => `/cards/${id}/sensitive`,
    pin: (id: string) => `/cards/${id}/pin`,
    controls: (id: string) => `/cards/${id}/controls`,
    report: (id: string) => `/cards/${id}/report`,
    transactions: (id: string) => `/cards/${id}/transactions`,
    authorisations: '/card-authorisations',
  },

  save: {
    goals: '/savings-goals',
    goal: (id: string) => `/savings-goals/${id}`,
    contribute: (id: string) => `/savings-goals/${id}/contribute`,
    withdraw: (id: string) => `/savings-goals/${id}/withdraw`,
    depositRates: '/deposits/rates',
    deposits: '/deposits',
    deposit: (id: string) => `/deposits/${id}`,
    breakQuote: (id: string) => `/deposits/${id}/break-quote`,
    break: (id: string) => `/deposits/${id}/break`,
  },

  borrow: {
    products: '/loans/products',
    calculate: '/loans/calculate',
    eligibility: '/loans/eligibility',
    applications: '/loans/applications',
    application: (id: string) => `/loans/applications/${id}`,
    acceptOffer: (id: string) => `/loans/applications/${id}/accept`,
    list: '/loans',
    byId: (id: string) => `/loans/${id}`,
    schedule: (id: string) => `/loans/${id}/schedule`,
    repay: (id: string) => `/loans/${id}/repay`,
    payoffQuote: (id: string) => `/loans/${id}/payoff-quote`,
    requestOverdraft: '/overdraft/request',
  },

  fx: {
    rates: '/fx/rates',
    board: '/fx/board',
    quote: '/fx/quote',
    convert: '/fx/convert',
    alerts: '/fx/alerts',
    alert: (id: string) => `/fx/alerts/${id}`,
  },

  notifications: {
    list: '/notifications',
    markRead: '/notifications/read',
    preferences: '/notifications/preferences',
    stream: '/notifications/stream',
    pushSubscribe: '/push/subscribe',
  },

  support: {
    tickets: '/tickets',
    ticket: (id: string) => `/tickets/${id}`,
    ticketMessages: (id: string) => `/tickets/${id}/messages`,
    disputes: '/disputes',
    dispute: (id: string) => `/disputes/${id}`,
    disputeEvidence: (id: string) => `/disputes/${id}/evidence`,
    fraudReports: '/fraud-reports',
  },

  business: {
    members: '/business/members',
    member: (id: string) => `/business/members/${id}`,
    approvals: '/business/approvals',
    decideApproval: (id: string) => `/business/approvals/${id}/decide`,
    invoices: '/business/invoices',
    invoice: (id: string) => `/business/invoices/${id}`,
    payroll: '/business/payroll',
  },

  files: {
    uploadSignature: '/files/upload-signature',
    byId: (id: string) => `/files/${id}`,
  },

  public: {
    rates: '/public/rates',
    fxBoard: '/public/fx-board',
    fees: '/public/fees',
    products: '/public/products',
    locations: '/public/locations',
    page: (slug: string) => `/public/pages/${slug}`,
    posts: '/public/posts',
    post: (slug: string) => `/public/posts/${slug}`,
    faqs: '/public/faqs',
    leads: '/public/leads',
    newsletter: '/public/newsletter',
    loanCalculator: '/public/calculators/loan',
    savingsCalculator: '/public/calculators/savings',
  },

  admin: {
    login: '/admin/auth/login',
    me: '/admin/auth/me',
    customers: '/admin/customers',
    customer: (id: string) => `/admin/customers/${id}`,
    freezeCustomer: (id: string) => `/admin/customers/${id}/freeze`,
    impersonate: (id: string) => `/admin/customers/${id}/impersonate`,
    kycQueue: '/admin/kyc',
    kycCase: (id: string) => `/admin/kyc/${id}`,
    decideKyc: (id: string) => `/admin/kyc/${id}/decide`,
    screeningHits: '/admin/screening',
    transactions: '/admin/transactions',
    journalEntries: '/admin/journal-entries',
    journalEntry: (id: string) => `/admin/journal-entries/${id}`,
    manualPostings: '/admin/manual-postings',
    approvals: '/admin/approvals',
    decideApproval: (id: string) => `/admin/approvals/${id}/decide`,
    holds: '/admin/holds',
    amlAlerts: '/admin/aml/alerts',
    amlCases: '/admin/aml/cases',
    amlCase: (id: string) => `/admin/aml/cases/${id}`,
    amlRules: '/admin/aml/rules',
    amlRule: (id: string) => `/admin/aml/rules/${id}`,
    backtestRule: (id: string) => `/admin/aml/rules/${id}/backtest`,
    fraudRules: '/admin/fraud/rules',
    disputes: '/admin/disputes',
    dispute: (id: string) => `/admin/disputes/${id}`,
    cards: '/admin/cards',
    loanApplications: '/admin/loans/applications',
    decideLoan: (id: string) => `/admin/loans/applications/${id}/decide`,
    arrears: '/admin/loans/arrears',
    products: '/admin/products',
    product: (code: string) => `/admin/products/${code}`,
    cmsPages: '/admin/cms/pages',
    cmsPage: (id: string) => `/admin/cms/pages/${id}`,
    cmsPosts: '/admin/cms/posts',
    cmsFaqs: '/admin/cms/faqs',
    cmsLocations: '/admin/cms/locations',
    publish: (id: string) => `/admin/cms/${id}/publish`,
    templates: '/admin/comms/templates',
    campaigns: '/admin/comms/campaigns',
    tickets: '/admin/tickets',
    ticket: (id: string) => `/admin/tickets/${id}`,
    trialBalance: '/admin/reports/trial-balance',
    generalLedger: '/admin/reports/general-ledger',
    profitAndLoss: '/admin/reports/profit-and-loss',
    balanceSheet: '/admin/reports/balance-sheet',
    reconciliation: '/admin/reports/reconciliation',
    users: '/admin/users',
    user: (id: string) => `/admin/users/${id}`,
    roles: '/admin/roles',
    audit: '/admin/audit',
    verifyAuditChain: '/admin/audit/verify',
    flags: '/admin/flags',
    flag: (key: string) => `/admin/flags/${key}`,
    jobs: '/admin/jobs',
    replayJob: (id: string) => `/admin/jobs/${id}/replay`,
  },

  simulation: {
    state: '/admin/simulation/state',
    clock: '/admin/simulation/clock',
    advance: '/admin/simulation/clock/advance',
    reset: '/admin/simulation/clock/reset',
    runJob: '/admin/simulation/jobs/run',
    rails: '/admin/simulation/rails',
    scenario: '/admin/simulation/scenario',
    traffic: '/admin/simulation/traffic',
    mint: '/admin/simulation/mint',
    moveRate: '/admin/simulation/fx/move',
    snapshots: '/admin/simulation/snapshots',
    restoreSnapshot: (id: string) => `/admin/simulation/snapshots/${id}/restore`,
  },

  system: {
    health: '/health',
    ready: '/health/ready',
    metrics: '/metrics',
    docs: '/docs',
  },
} as const;

/** Prefixes a route with the API version. */
export function apiPath(path: string): string {
  return `${API_PREFIX}${path}`;
}
