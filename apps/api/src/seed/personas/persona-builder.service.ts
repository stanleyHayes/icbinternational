import { Injectable, Logger } from '@nestjs/common';

import { AccountType, type Account } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { entries, type JournalEntry } from '../../domain/ledger/index.js';
import { AccountOpeningService } from '../../modules/accounts/account-opening.service.js';
import { PostingService } from '../../modules/ledger/posting.service.js';
import { TransactionProjectorService } from '../../modules/transactions/transaction-projector.service.js';

import { CustomerFactoryService } from './customer-factory.service.js';
import { planHistory, savingsSweepFor, type PlannedMovement } from './history-plan.js';
import { type Persona, type PersonaAccount } from './persona-definitions.js';
import { SeededRandom } from './seeded-random.js';

/** What one persona turned into, for the showcase summary. */
export interface BuiltPersona {
  readonly key: string;
  readonly name: string;
  readonly email: string;
  readonly accounts: readonly { id: string; label: string; number: string }[];
  readonly movements: number;
  readonly demonstrates: string;
}

/**
 * Builds one customer, with a plausible past.
 *
 * Every movement goes through `PostingService`, exactly as a live request would. Writing
 * balances directly would be faster and would produce a dataset that looks identical on
 * screen — right up to the moment `pnpm ledger:verify` runs and finds a book that does not
 * reconcile. A demonstration bank whose ledger does not balance is demonstrating the wrong
 * thing.
 */
@Injectable()
export class PersonaBuilderService {
  private readonly logger = new Logger(PersonaBuilderService.name);

  constructor(
    private readonly customers: CustomerFactoryService,
    private readonly opening: AccountOpeningService,
    private readonly posting: PostingService,
    private readonly projector: TransactionProjectorService,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  async build(persona: Persona, seed: string): Promise<BuiltPersona> {
    const realNow = this.clock.now();
    const random = new SeededRandom(`${seed}:${persona.key}`);

    try {
      const userId = await this.customers.create(persona);
      const accounts = await this.openAccounts(persona, userId);
      const movements = await this.replayHistory({ persona, accounts, random, endingAt: realNow });

      return {
        key: persona.key,
        name: `${persona.firstName} ${persona.lastName}`,
        email: persona.email,
        accounts: accounts.map((account) => ({
          id: account.id,
          label: account.nickname ?? account.productName,
          number: account.number,
        })),
        movements,
        demonstrates: persona.demonstrates,
      };
    } finally {
      // History is written by moving the clock into the past. Leaving it there would make
      // every later operation — a login, a job, the next persona — happen last year.
      this.clock.reset();
    }
  }

  private async openAccounts(persona: Persona, userId: string): Promise<Account[]> {
    const opened: Account[] = [];

    for (const definition of persona.accounts) {
      opened.push(await this.openOne({ definition, userId }));
    }

    return opened;
  }

  private async openOne(input: { definition: PersonaAccount; userId: string }): Promise<Account> {
    const { definition, userId } = input;
    const currency = definition.currency as CurrencyCode;

    const account = await this.opening.open({
      userId,
      request: {
        productCode: definition.productCode,
        currency,
        ...(definition.nickname ? { nickname: definition.nickname } : {}),
        additionalHolderEmails: [],
      },
    });

    if (definition.openingMinor > 0) {
      await this.fund(account.id, Money.fromMinor(definition.openingMinor, currency));
    }

    return account;
  }

  /**
   * Funds an account from the external clearing account.
   *
   * Even generated money has to come from somewhere. Crediting a customer with no matching
   * debit would break the trial balance on the first run and quietly void the double-entry
   * guarantee everything else rests on.
   */
  private async fund(accountId: string, amount: Money): Promise<void> {
    await this.book(
      entries.simulatedFunding({
        reference: this.ids.generate('journalEntry'),
        accountId,
        amount,
        description: 'Opening credit',
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
      }),
    );
  }

  private async replayHistory(input: {
    persona: Persona;
    accounts: readonly Account[];
    random: SeededRandom;
    endingAt: Date;
  }): Promise<number> {
    const { persona, accounts, random, endingAt } = input;

    const current = accounts[0];
    if (!current || persona.historyMonths === 0) return 0;

    const currency = current.currency;
    // A savings account in the same currency, not merely "some other account". The
    // freelancer holds a EUR wallet at index 1, and sweeping GBP into it is a currency
    // mismatch the money package rightly refuses rather than converting behind our back.
    const savings = accounts.find(
      (account) =>
        account.id !== current.id &&
        account.type === AccountType.SAVINGS &&
        account.currency === currency,
    );
    const sweep = savings ? savingsSweepFor(persona, currency) : null;

    const plan = planHistory({
      persona,
      currency,
      endingAt,
      random,
      sweep,
      // The account object predates its opening credit, so the persona definition is the
      // balance the history actually starts from.
      openingBalance: Money.fromMinor(persona.accounts[0]?.openingMinor ?? 0, currency),
      // Unused facility on an unfunded account is the whole facility. Planning against it
      // keeps the generated history inside what the ledger will accept.
      floor: Money.fromMinor(current.balance.overdraftAvailable.amount, currency).negate(),
    });

    await this.postPlan({ plan, currentId: current.id, savingsId: savings?.id ?? null });

    this.logger.log(
      `${persona.key}: ${plan.length} movements over ${persona.historyMonths} months`,
    );
    return plan.length;
  }

  /**
   * Posts every planned movement, in order, as of its own date.
   *
   * The clock is moved to each movement before it is booked, so statements, interest
   * accrual and the insights charts see a history that happened over time rather than one
   * that all arrived at once.
   */
  private async postPlan(input: {
    plan: readonly PlannedMovement[];
    currentId: string;
    savingsId: string | null;
  }): Promise<void> {
    const { plan, currentId, savingsId } = input;

    for (const movement of plan) {
      this.clock.freezeAt(movement.at);

      if (movement.kind === 'TRANSFER_TO_SAVINGS') {
        // Only reachable when a sweep was planned, which required a savings account.
        if (savingsId) {
          await this.sweepToSavings({ from: currentId, to: savingsId, amount: movement.amount });
        }
        continue;
      }

      await this.postMovement({ movement, accountId: currentId });
    }
  }

  private async postMovement(input: {
    movement: PlannedMovement;
    accountId: string;
  }): Promise<void> {
    const { movement, accountId } = input;
    const common = {
      reference: this.ids.generate('journalEntry'),
      accountId,
      amount: movement.amount,
      description: movement.description,
      valueDate: this.clock.today(),
      bookedAt: movement.at,
    };

    if (movement.kind === 'SALARY') {
      await this.book(entries.inboundTransfer({ ...common, toAccountId: accountId }));
      return;
    }

    await this.book(
      entries.cardPurchase({
        ...common,
        ...(movement.merchantName ? { metadata: { merchant: movement.merchantName } } : {}),
      }),
    );
  }

  /**
   * Posts an entry and projects it, which is what a live request does.
   *
   * `PostingService` writes the journal and moves the balances; it does not write the
   * `transactions` collection. That projection is a separate step every real path takes
   * after posting, and skipping it here produced a bank whose ledger reconciled perfectly
   * and whose customers saw an empty activity feed: 3,033 journal entries, no rows on any
   * statement. The balances were right, which is exactly what made it easy to miss.
   */
  private async book(entry: JournalEntry): Promise<void> {
    const record = await this.posting.post(entry);
    await this.projector.project(record);
  }

  private async sweepToSavings(input: { from: string; to: string; amount: Money }): Promise<void> {
    await this.book(
      entries.internalTransfer({
        reference: this.ids.generate('journalEntry'),
        fromAccountId: input.from,
        toAccountId: input.to,
        amount: input.amount,
        description: 'Monthly saving',
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
      }),
    );
  }
}
