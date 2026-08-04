import { createHash } from 'node:crypto';

import { CardFormat, CardTier, type CardScheme } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type AppConfigService } from '../../../config/config.service.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import { CardNetworkSimulator } from '../../../rails/card-network/index.js';
import {
  frozenClock,
  gbp,
  retryingRunner,
  seedAccount,
  TEST_USER,
} from '../../accounts/__tests__/accounts-harness.js';
import { type AccountService } from '../../accounts/account.service.js';
import {
  accountNotFound,
  isHeldBy,
  type InMemoryAccountStore,
  type OwnedAccountRef,
} from '../../accounts/index.js';
import { type PasswordService } from '../../auth/password.service.js';
import { type UsersService } from '../../auth/users/index.js';
import { holdsRig, type HoldsRig } from '../../holds/__tests__/holds-harness.js';
import { AuthorisationBookingService } from '../authorisation/authorisation-booking.service.js';
import { CardNetworkGateway } from '../authorisation/authorisation-gateway.service.js';
import { AuthorisationGuardService } from '../authorisation/authorisation-guard.service.js';
import { AuthorisationLifecycleService } from '../authorisation/authorisation-lifecycle.service.js';
import { CardAuthorisationService } from '../authorisation/card-authorisation.service.js';
import { CardCaptureService } from '../authorisation/card-capture.service.js';
import { CardRefundService } from '../authorisation/card-refund.service.js';
import { CardSettlementService } from '../authorisation/card-settlement.service.js';
import { type CardTransactionLinker } from '../authorisation/card-transaction.linker.js';
import { InMemoryAuthorisationStore } from '../authorisation/in-memory-authorisation.store.js';
import { SpendWindowReader } from '../authorisation/spend-window.reader.js';
import { CardService } from '../card.service.js';
import { type CardRecord } from '../card.store.js';
import { CardControlsService } from '../controls/card-controls.service.js';
import { InMemoryCardStore } from '../in-memory-card.store.js';
import { CardInsightsService } from '../insights/card-insights.service.js';
import { CardDeliveryService } from '../issuing/card-delivery.service.js';
import { CardIssuingService } from '../issuing/card-issuing.service.js';
import { CardSensitiveService } from '../issuing/card-sensitive.service.js';
import { CardFactory } from '../issuing/card.factory.js';
import { PanTokeniser } from '../issuing/pan-tokeniser.js';
import { CardLifecycleService } from '../lifecycle/card-lifecycle.service.js';
import { CardPinService } from '../lifecycle/card-pin.service.js';
import { CardReplacementService } from '../lifecycle/card-replacement.service.js';

/** The seed every card test runs under. Two runs under it are indistinguishable. */
export const TEST_SEED = 'reliance-cards-test';

/** The bank's own country, matching the shipped defaults. */
export const TEST_HOME_COUNTRY = 'GB';

/** Test cardholder, as it would be embossed. */
export const TEST_CARDHOLDER = 'ADA LOVELACE';

/** A merchant the fixtures charge against. */
export const TEST_MERCHANT = {
  merchantId: 'mrc_kingsway_coffee',
  merchantName: 'Kingsway Coffee',
  merchantCountry: 'GB',
  mcc: '5812',
} as const;

/** The cards lane wired end to end over in-memory stores. */
export interface CardsRig {
  accounts: InMemoryAccountStore;
  cardStore: InMemoryCardStore;
  authStore: InMemoryAuthorisationStore;
  cards: CardService;
  issuing: CardIssuingService;
  delivery: CardDeliveryService;
  sensitive: CardSensitiveService;
  tokeniser: PanTokeniser;
  lifecycle: CardLifecycleService;
  pins: CardPinService;
  replacement: CardReplacementService;
  controls: CardControlsService;
  authorise: CardAuthorisationService;
  authLifecycle: AuthorisationLifecycleService;
  capture: CardCaptureService;
  refunds: CardRefundService;
  settlement: CardSettlementService;
  insights: CardInsightsService;
  network: CardNetworkSimulator;
  holds: HoldsRig;
  clock: ClockService;
  runner: TransactionRunner;
}

/**
 * Everything below the fakes is real.
 *
 * The PAN derivation, the Luhn check, the control rules, the limit arithmetic, the
 * decision engine, the hold placement, the posting service and the chart of accounts all
 * run as they do in production. Only persistence, the customer directory and the PIN
 * hash are substituted — the last because Argon2 at production cost would make an
 * authorisation suite take minutes.
 */
export function cardsRig(options: { railFailureBps?: number } = {}): CardsRig {
  const config = fakeConfig(options);
  const clock = frozenClock();
  const runner = retryingRunner();
  const holds = holdsRig();
  const accounts = holds.accounts;

  const cardStore = new InMemoryCardStore();
  const authStore = new InMemoryAuthorisationStore(new IdGenerator());
  const tokeniser = new PanTokeniser(config);
  const cards = new CardService(cardStore);
  const pins = new CardPinService(cardStore, fakePasswords(), clock);
  const lifecycle = new CardLifecycleService(cardStore, pins, clock);
  const factory = new CardFactory(tokeniser, fakeUsers(), clock, new IdGenerator());
  const issuing = new CardIssuingService(
    cardStore,
    fakeAccountService(cards, accounts),
    factory,
    runner,
  );
  const windows = new SpendWindowReader(authStore, clock);
  const network = new CardNetworkSimulator(config);

  return {
    accounts,
    cardStore,
    authStore,
    cards,
    issuing,
    tokeniser,
    pins,
    lifecycle,
    network,
    holds,
    clock,
    runner,
    delivery: new CardDeliveryService(cardStore, lifecycle, clock),
    sensitive: new CardSensitiveService(tokeniser, clock),
    replacement: new CardReplacementService(cardStore, lifecycle, issuing, clock),
    controls: new CardControlsService(cards, cardStore, windows),
    authorise: new CardAuthorisationService(
      cards,
      new CardNetworkGateway(network, clock),
      new AuthorisationGuardService(fakeAccountService(cards, accounts), windows, pins, config),
      new AuthorisationBookingService(authStore, holds.holds, runner),
    ),
    authLifecycle: new AuthorisationLifecycleService(authStore, holds.holds, clock, runner),
    capture: new CardCaptureService(authStore, holds.capture, nullLinker(), runner),
    refunds: new CardRefundService(authStore, holds.ledger.postings, clock, runner),
    settlement: new CardSettlementService(authStore, clock),
    insights: new CardInsightsService(cards, authStore),
  };
}

/** Seeds a funded account and issues an active virtual card on it. */
export async function seedActiveCard(
  rig: CardsRig,
  options: { balance?: Money; format?: CardFormat; tier?: CardTier } = {},
): Promise<CardRecord> {
  const accountId = await seedAccount(rig.accounts, {
    ledger: options.balance ?? gbp(500_00),
  });

  return rig.issuing.issue({
    userId: TEST_USER,
    request: {
      accountId,
      format: options.format ?? CardFormat.VIRTUAL,
      tier: options.tier ?? CardTier.STANDARD,
      deliveryAddressOverride: false,
    },
  });
}

/**
 * An authorisation request against the fixture merchant, in GBP.
 *
 * `threeDsCompleted` defaults to true, and that default is what makes every suite except
 * the 3DS one deterministic. A remote payment above the low-value exemption is *always*
 * challenged, and a challenge is abandoned or failed a modelled share of the time — so a
 * fixture that ignored authentication would decline roughly one payment in eight, at
 * random, in tests that are not about authentication at all.
 *
 * Passing the acquirer's own authentication through is also the realistic case: a
 * checkout that has already stepped the cardholder up does exactly this.
 */
export function purchase(
  cardId: string,
  minor: number,
  overrides: Partial<AuthorisationRequestShape> = {},
): AuthorisationRequestShape {
  return {
    cardId,
    ...TEST_MERCHANT,
    channel: 'ONLINE',
    amount: gbp(minor),
    originalAmount: null,
    partialApprovalAllowed: false,
    threeDsCompleted: true,
    ...overrides,
  };
}

/** The shape `CardAuthorisationService.authorise` takes, spelled for the fixtures. */
export interface AuthorisationRequestShape {
  cardId: string;
  merchantId: string;
  merchantName: string;
  merchantCountry: string;
  mcc: string;
  channel: 'ONLINE' | 'CONTACTLESS' | 'CHIP' | 'MAGSTRIPE' | 'ATM' | 'RECURRING';
  amount: Money;
  originalAmount: Money | null;
  partialApprovalAllowed: boolean;
  pin?: string;
  threeDsCompleted?: boolean;
}

/** Config with the rail wide awake: no outages, so a decline is always a real decision. */
function fakeConfig(overrides: { railFailureBps?: number } = {}): AppConfigService {
  return {
    encryptionKey: 'test-encryption-key-at-least-32-chars-long',
    bank: { country: TEST_HOME_COUNTRY },
    simulation: {
      seed: TEST_SEED,
      railFailureBps: overrides.railFailureBps ?? 0,
      latencyMinMs: 10,
      latencyMaxMs: 20,
    },
  } as unknown as AppConfigService;
}

/**
 * A password service over SHA-256 rather than Argon2.
 *
 * Argon2 at production cost turns an authorisation suite into a minutes-long run, so the
 * work factor is what is substituted — not the property being relied on. The digest is
 * still a genuine one-way hash, which matters: a fake that stored `hashed:${pin}` would
 * make "the PIN never appears in the record" pass for the wrong reason and go on passing
 * after somebody stored the PIN in clear.
 */
function fakePasswords(): PasswordService {
  const digestOf = (plaintext: string) =>
    createHash('sha256').update(plaintext).digest('base64url');

  return {
    hash: async (plaintext: string) => digestOf(plaintext),
    verify: async (digest: string, plaintext: string) => digest === digestOf(plaintext),
  } as unknown as PasswordService;
}

function fakeUsers(): UsersService {
  const [firstName, lastName] = TEST_CARDHOLDER.split(' ');
  return { requireById: async () => ({ firstName, lastName }) } as unknown as UsersService;
}

/**
 * An `AccountService` over the in-memory store.
 *
 * Only the three methods the cards lane calls are provided. A fuller fake would be a
 * second implementation of the accounts lane, and the point of a fake is to be obviously
 * not that.
 */
function fakeAccountService(_cards: CardService, accounts: InMemoryAccountStore): AccountService {
  return {
    require: async (accountId: string) => {
      const account = await accounts.findById(accountId);
      if (!account) throw new Error(`Fixture account ${accountId} is missing`);
      return account;
    },
    // Holds the real ownership rule, not just the real shape. A fake that returns any
    // account it is handed cannot fail the test that catches a caller reading someone
    // else's account, which is the only reason this method exists.
    requireOwned: async ({ accountId, userId }: OwnedAccountRef) => {
      const account = await accounts.findById(accountId);
      if (!account) throw new Error(`Fixture account ${accountId} is missing`);
      if (!isHeldBy(account, userId)) throw accountNotFound(accountId);
      return account;
    },
  } as unknown as AccountService;
}

/**
 * A linker that projects nothing.
 *
 * The transaction projector belongs to another lane and is covered by its own suite; what
 * these tests are about is that the money moved and the hold was resolved. Returning null
 * exercises the same branch a GL-only entry does in production.
 */
function nullLinker(): CardTransactionLinker {
  return { link: async () => null } as unknown as CardTransactionLinker;
}

/** The scheme a standard card is issued on, for assertions about BIN routing. */
export const STANDARD_SCHEME: CardScheme = 'VISA';
