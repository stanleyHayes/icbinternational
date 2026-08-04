import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { FxExecutionService } from '../fx-execution.service.js';
import { type FxQuoteRecord } from '../fx-quote.store.js';
import { toContractConversion } from '../fx.mapper.js';

import {
  fakeRunner,
  frozenClock,
  quoteDraft,
  quoteStore,
  RecordingConversionPoster,
  StubBalances,
} from './fx-harness.js';

const QUOTE_TTL_MS = 90_000;

function rig(clockIso?: string) {
  const clock = frozenClock(clockIso);
  const quotes = quoteStore();
  const poster = new RecordingConversionPoster(clock);
  const balances = new StubBalances();

  const service = new FxExecutionService(
    quotes,
    poster.asPoster(),
    balances.asService(),
    fakeRunner(),
  );

  return { clock, quotes, poster, balances, service };
}

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }

  return 'NO_ERROR_THROWN';
}

describe('executing an FX quote', () => {
  it('converts at the rate the customer was shown', async () => {
    const { quotes, clock, service } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    const executed = await service.execute({ userId: quote.userId, quoteId: quote.id });

    expect(executed.conversionId).not.toBeNull();
    expect(executed.journalEntryId).not.toBeNull();
    expect(executed.rate).toBe(quote.rate);
    expect(executed.buyAmount).toStrictEqual(quote.buyAmount);
  });

  it('checks the wallet can cover the sale inside the transaction', async () => {
    const { quotes, clock, service, balances } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    await service.execute({ userId: quote.userId, quoteId: quote.id });

    expect(balances.checked).toStrictEqual([quote.fromAccountId]);
  });

  it('refuses when the wallet cannot cover the sale, and books nothing', async () => {
    const { quotes, clock, service, balances, poster } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));
    balances.broke();

    expect(await codeOf(service.execute({ userId: quote.userId, quoteId: quote.id }))).toBe(
      ErrorCode.INSUFFICIENT_FUNDS,
    );
    expect(poster.posted).toStrictEqual([]);
    expect((await quotes.findById(quote.id, quote.userId))?.conversionId).toBeNull();
  });

  // The property this whole lane exists to protect.
  it('will not execute an expired quote', async () => {
    const { quotes, clock, service, poster } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    clock.advance(QUOTE_TTL_MS + 1);

    expect(await codeOf(service.execute({ userId: quote.userId, quoteId: quote.id }))).toBe(
      ErrorCode.QUOTE_EXPIRED,
    );
    expect(poster.posted).toStrictEqual([]);
  });

  it('will not execute a quote that expires on the exact boundary', async () => {
    const { quotes, clock, service } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    clock.advance(QUOTE_TTL_MS);

    expect(await codeOf(service.execute({ userId: quote.userId, quoteId: quote.id }))).toBe(
      ErrorCode.QUOTE_EXPIRED,
    );
  });

  it('executes a quote exactly once, and replays the same conversion', async () => {
    const { quotes, clock, service, poster } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    const first = await service.execute({ userId: quote.userId, quoteId: quote.id });
    const second = await service.execute({ userId: quote.userId, quoteId: quote.id });

    expect(second.conversionId).toBe(first.conversionId);
    expect(poster.posted).toStrictEqual([quote.id]);
  });

  it('separates two authorisations racing on one quote', async () => {
    const { quotes, clock, service } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    const [left, right] = await Promise.all([
      service.execute({ userId: quote.userId, quoteId: quote.id }),
      service.execute({ userId: quote.userId, quoteId: quote.id }),
    ]);

    expect(right.conversionId).toBe(left.conversionId);
  });

  it('refuses a quote that belongs to somebody else', async () => {
    const { quotes, clock, service } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));

    expect(
      await codeOf(
        service.execute({ userId: 'usr_01JQ8Z0000000000000000000Z', quoteId: quote.id }),
      ),
    ).toBe(ErrorCode.QUOTE_NOT_FOUND);
  });

  it('refuses a quote that does not exist', async () => {
    const { service } = rig();

    expect(
      await codeOf(
        service.execute({
          userId: 'usr_01JQ8Z0000000000000000000A',
          quoteId: 'qte_01JQ8Z0000000000000000000A',
        }),
      ),
    ).toBe(ErrorCode.QUOTE_NOT_FOUND);
  });
});

describe('reporting a conversion', () => {
  it('renders as a settled internal transfer between the two wallets', async () => {
    const { quotes, clock, service } = rig();
    const quote = await quotes.insert(quoteDraft(clock.now()));
    const executed = await service.execute({ userId: quote.userId, quoteId: quote.id });

    const transfer = toContractConversion(executed);

    expect(transfer.rail).toBe('INTERNAL');
    expect(transfer.status).toBe('SETTLED');
    expect(transfer.sourceAccountId).toBe(quote.fromAccountId);
    expect(transfer.destination).toStrictEqual({
      kind: 'INTERNAL',
      accountId: quote.toAccountId,
    });
    expect(transfer.exchangeRate).toBe(quote.rate);
    expect(transfer.timeline).toHaveLength(2);
  });

  it('refuses to render a quote nobody has executed', () => {
    const unexecuted = { id: 'qte_X', conversionId: null } as unknown as FxQuoteRecord;
    expect(() => toContractConversion(unexecuted)).toThrow(RangeError);
  });
});
