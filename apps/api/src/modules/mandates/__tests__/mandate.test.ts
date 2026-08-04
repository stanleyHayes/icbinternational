import { ErrorCode, MandateStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { fromStored } from '../../../common/money/money.codec.js';
import { MandateCollectionService } from '../mandate-collection.service.js';
import { MandateDisputeService } from '../mandate-dispute.service.js';
import { GUARANTEE_WINDOW_DAYS, MS_PER_DAY } from '../mandate.constants.js';
import { toContractMandate } from '../mandate.mapper.js';
import { MandateService } from '../mandate.service.js';

import {
  ACCOUNT,
  CUSTOMER,
  fakeRunner,
  frozenClock,
  mandateDraft,
  mandateStore,
  RecordingMandatePoster,
  StubAccounts,
} from './mandate-harness.js';

const MONTH_MS = 30 * MS_PER_DAY;

function rig() {
  const clock = frozenClock();
  const mandates = mandateStore();
  const poster = new RecordingMandatePoster(clock);
  const service = new MandateService(mandates, new StubAccounts().asService(), clock);
  const collections = new MandateCollectionService(
    mandates,
    poster.asPoster(),
    service,
    fakeRunner(),
  );
  const disputes = new MandateDisputeService(mandates, poster.asPoster(), fakeRunner());

  return { clock, mandates, poster, service, collections, disputes };
}

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }

  return 'NO_ERROR_THROWN';
}

describe('setting up a mandate', () => {
  it('registers the authority against the customer’s own account', async () => {
    const { service } = rig();

    const mandate = await service.setUp({
      userId: CUSTOMER,
      accountId: ACCOUNT,
      merchantName: 'Meridian Fitness',
      reference: 'MF-4471902',
      frequency: 'MONTHLY',
      fixedAmount: Money.fromMajor('42.50', 'GBP'),
    });

    expect(mandate.status).toBe(MandateStatus.ACTIVE);
    expect(mandate.cancelledAt).toBeNull();
  });

  it('gives the merchant the scheme’s advance notice before the first collection', async () => {
    const { service, clock } = rig();

    const mandate = await service.setUp({
      userId: CUSTOMER,
      accountId: ACCOUNT,
      merchantName: 'Meridian Fitness',
      reference: 'MF-4471902',
      frequency: 'MONTHLY',
    });

    const notice = (mandate.nextExpectedAt?.getTime() ?? 0) - clock.timestamp();
    expect(notice).toBe(3 * MS_PER_DAY);
  });

  it('refuses an account that is not theirs', async () => {
    const { service } = rig();

    expect(
      await codeOf(
        service.setUp({
          userId: 'usr_01JQ8Z0000000000000000000Z',
          accountId: ACCOUNT,
          merchantName: 'Meridian Fitness',
          reference: 'MF-4471902',
          frequency: 'MONTHLY',
        }),
      ),
    ).toBe(ErrorCode.ACCOUNT_NOT_FOUND);
  });
});

describe('collecting under a mandate', () => {
  it('takes the fixed amount and schedules the next one', async () => {
    const { mandates, clock, collections, poster } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    const collected = await collections.collect({ mandateId: mandate.id });

    expect(poster.booked).toStrictEqual([`collect:${mandate.id}`]);
    expect(fromStored(collected.lastAmount!).toMajorString()).toBe('42.50');
    expect(collected.nextExpectedAt?.getTime()).toBe(clock.timestamp() + MONTH_MS);
  });

  it('records the collection against the entry that moved the money', async () => {
    const { mandates, clock, collections } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    const collected = await collections.collect({ mandateId: mandate.id });

    expect(collected.collections).toHaveLength(1);
    expect(collected.collections[0]?.journalEntryId).toBe('jnl_collect_1');
    expect(collected.collections[0]?.refundedAt).toBeNull();
  });

  it('refuses a merchant taking more than the customer agreed to', async () => {
    const { mandates, clock, collections, poster } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now(), { fixedAmount: null }));

    expect(
      await codeOf(
        collections.collect({ mandateId: mandate.id, amount: Money.fromMajor('99.00', 'GBP') }),
      ),
    ).toBe(ErrorCode.AMOUNT_ABOVE_MAXIMUM);
    expect(poster.booked).toStrictEqual([]);
  });

  it('refuses a variable collection with no amount at all', async () => {
    const { mandates, clock, collections } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now(), { fixedAmount: null }));

    expect(await codeOf(collections.collect({ mandateId: mandate.id }))).toBe(
      ErrorCode.INVALID_AMOUNT,
    );
  });
});

/** The property a customer relies on most: stopping a payment actually stops it. */
describe('cancelling a mandate', () => {
  it('blocks the next collection', async () => {
    const { mandates, clock, service, collections, poster } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.CANCELLED,
    });

    expect(await codeOf(collections.collect({ mandateId: mandate.id }))).toBe(
      ErrorCode.MANDATE_CANCELLED,
    );
    expect(poster.booked).toStrictEqual([]);
  });

  it('is immediate, and stamps when it happened', async () => {
    const { mandates, clock, service } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    const cancelled = await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.CANCELLED,
    });

    expect(cancelled.status).toBe(MandateStatus.CANCELLED);
    expect(cancelled.cancelledAt?.toISOString()).toBe(clock.now().toISOString());
  });

  it('is final — nothing brings the authority back', async () => {
    const { mandates, clock, service } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.CANCELLED,
    });

    expect(
      await codeOf(
        service.setStatus({
          userId: CUSTOMER,
          mandateId: mandate.id,
          status: MandateStatus.ACTIVE,
        }),
      ),
    ).toBe(ErrorCode.MANDATE_CANCELLED);
  });

  it('excludes a cancelled mandate from the sweep', async () => {
    const { mandates, clock, service, collections } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.CANCELLED,
    });

    expect(await collections.collectDue()).toStrictEqual({ attempted: 0, collected: 0 });
  });
});

describe('pausing a mandate', () => {
  it('stops collections without ending the authority', async () => {
    const { mandates, clock, service, collections } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.PAUSED,
    });

    expect(await codeOf(collections.collect({ mandateId: mandate.id }))).toBe(
      ErrorCode.PRECONDITION_FAILED,
    );
  });

  it('can be restarted', async () => {
    const { mandates, clock, service, collections } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.PAUSED,
    });
    await service.setStatus({
      userId: CUSTOMER,
      mandateId: mandate.id,
      status: MandateStatus.ACTIVE,
    });

    expect((await collections.collect({ mandateId: mandate.id })).collections).toHaveLength(1);
  });
});

describe('the collection sweep', () => {
  it('collects what is due and moves the date on', async () => {
    const { mandates, clock, collections } = rig();
    await mandates.insert(mandateDraft(clock.now()));

    expect(await collections.collectDue()).toStrictEqual({ attempted: 1, collected: 1 });
    expect(await collections.collectDue()).toStrictEqual({ attempted: 0, collected: 0 });
  });

  it('does not let one unpaid Direct Debit stop the others', async () => {
    const { mandates, clock, collections, poster } = rig();
    await mandates.insert(mandateDraft(clock.now()));
    await mandates.insert(mandateDraft(clock.now(), { reference: 'MF-9902113' }));
    poster.broke();

    expect(await collections.collectDue()).toStrictEqual({ attempted: 2, collected: 0 });
  });
});

describe('the Direct Debit Guarantee', () => {
  it('refunds the customer in full, immediately', async () => {
    const { mandates, clock, collections, disputes, poster } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    await collections.collect({ mandateId: mandate.id });

    const refunded = await disputes.refund({
      userId: CUSTOMER,
      mandateId: mandate.id,
      collectionEntryId: 'jnl_collect_1',
      reason: 'I cancelled this membership last month',
    });

    expect(poster.booked).toContain('refund:jnl_collect_1');
    expect(refunded.collections[0]?.refundedAt).not.toBeNull();
    expect(refunded.collections[0]?.refundEntryId).toBe('jnl_refund_jnl_collect_1');
  });

  it('leaves the original collection standing, so the statement shows both', async () => {
    const { mandates, clock, collections, disputes } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    await collections.collect({ mandateId: mandate.id });

    const refunded = await disputes.refund({
      userId: CUSTOMER,
      mandateId: mandate.id,
      collectionEntryId: 'jnl_collect_1',
      reason: 'Not recognised',
    });

    expect(refunded.collections).toHaveLength(1);
    expect(refunded.collections[0]?.journalEntryId).toBe('jnl_collect_1');
  });

  it('refunds once, however many times it is claimed', async () => {
    const { mandates, clock, collections, disputes, poster } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    await collections.collect({ mandateId: mandate.id });

    const claim = {
      userId: CUSTOMER,
      mandateId: mandate.id,
      collectionEntryId: 'jnl_collect_1',
      reason: 'Not recognised',
    };

    await disputes.refund(claim);

    expect(await codeOf(disputes.refund(claim))).toBe(ErrorCode.DISPUTE_ALREADY_RAISED);
    expect(poster.booked.filter((entry) => entry.startsWith('refund:'))).toHaveLength(1);
  });

  it('closes after the indemnity window', async () => {
    const { mandates, clock, collections, disputes } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    await collections.collect({ mandateId: mandate.id });

    clock.advance((GUARANTEE_WINDOW_DAYS + 1) * MS_PER_DAY);

    expect(
      await codeOf(
        disputes.refund({
          userId: CUSTOMER,
          mandateId: mandate.id,
          collectionEntryId: 'jnl_collect_1',
          reason: 'Not recognised',
        }),
      ),
    ).toBe(ErrorCode.DISPUTE_WINDOW_CLOSED);
  });

  it('refuses a claim on a collection that never happened', async () => {
    const { mandates, clock, disputes } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));

    expect(
      await codeOf(
        disputes.refund({
          userId: CUSTOMER,
          mandateId: mandate.id,
          collectionEntryId: 'jnl_nothing',
          reason: 'Not recognised',
        }),
      ),
    ).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('reporting a mandate', () => {
  it('summarises the authority without republishing every collection', async () => {
    const { mandates, clock, collections } = rig();
    const mandate = await mandates.insert(mandateDraft(clock.now()));
    const collected = await collections.collect({ mandateId: mandate.id });

    const wire = toContractMandate(collected);

    expect(wire).not.toHaveProperty('collections');
    expect(wire).not.toHaveProperty('userId');
    expect(wire.lastAmount?.amount).toBe('4250');
    expect(wire.frequency).toBe('MONTHLY');
  });
});
