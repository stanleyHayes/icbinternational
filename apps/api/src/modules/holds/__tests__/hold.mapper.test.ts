import { holdSchema, HoldReason, HoldStatus } from '@reliance/contracts';

import { toContractHold } from '../hold.mapper.js';
import { toRecord } from '../hold.repository.js';
import { type HoldDocument } from '../hold.schema.js';
import { type HoldRecord } from '../hold.store.js';

const PLACED_AT = new Date('2026-03-01T09:00:00.000Z');

function holdRecord(overrides: Partial<HoldRecord> = {}): HoldRecord {
  return {
    id: 'hld_01JQ8Z00000000000000000000',
    accountId: 'acc_01JQ8Z00000000000000000000',
    amount: { amount: '12000', currency: 'GBP' },
    reason: HoldReason.CARD_AUTHORISATION,
    status: HoldStatus.ACTIVE,
    description: 'Cafe Terzo',
    placedAt: PLACED_AT,
    expiresAt: null,
    resolvedAt: null,
    authorisationId: null,
    capturedAmount: null,
    capturedEntryId: null,
    ...overrides,
  };
}

describe('toContractHold', () => {
  it('renders a live hold exactly as holdSchema describes it', () => {
    expect(() => holdSchema.parse(toContractHold(holdRecord()))).not.toThrow();
  });

  it('renders a resolved hold with both timestamps', () => {
    const wire = holdSchema.parse(
      toContractHold(
        holdRecord({
          status: HoldStatus.CAPTURED,
          resolvedAt: PLACED_AT,
          expiresAt: PLACED_AT,
          capturedAmount: { amount: '3000', currency: 'GBP' },
        }),
      ),
    );

    expect(wire.resolvedAt).toBe(PLACED_AT.toISOString());
    expect(wire.expiresAt).toBe(PLACED_AT.toISOString());
  });

  /**
   * The captured amount is stored but has no field in the contract. It is deliberately
   * not smuggled onto another field — a partial capture surfaces as the transaction it
   * produced, and inventing a shape the client does not know about helps nobody.
   */
  it('does not leak fields the contract has no place for', () => {
    const wire = toContractHold(
      holdRecord({ capturedAmount: { amount: '3000', currency: 'GBP' } }),
    );

    expect(Object.keys(wire).sort()).toEqual(
      [
        'accountId',
        'amount',
        'description',
        'expiresAt',
        'id',
        'placedAt',
        'reason',
        'resolvedAt',
        'status',
      ].sort(),
    );
  });
});

describe('document to record', () => {
  it('detaches the money objects from the document', () => {
    const plain = {
      id: 'hld_01JQ8Z00000000000000000000',
      amount: { amount: '12000', currency: 'GBP' },
      capturedAmount: { amount: '3000', currency: 'GBP' },
    };
    const document = { toObject: () => plain } as unknown as HoldDocument;

    const record = toRecord(document);

    expect(record.amount).not.toBe(plain.amount);
    expect(record.amount).toEqual(plain.amount);
    expect(record.capturedAmount).toEqual(plain.capturedAmount);
  });

  it('keeps a null captured amount null rather than copying an empty object', () => {
    const document = {
      toObject: () => ({ amount: { amount: '1', currency: 'GBP' }, capturedAmount: null }),
    } as unknown as HoldDocument;

    expect(toRecord(document).capturedAmount).toBeNull();
  });
});
