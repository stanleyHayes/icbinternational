import { LetterKind, PREFIXED_ID_PATTERN, StatementFormat } from '@reliance/contracts';

import { decodeLetterId, letterId } from '../letter-id.js';
import { decodeStatementId, statementId } from '../statement-id.js';
import { customPeriod, monthlyPeriod } from '../statement-period.js';

import { ACCOUNT_ID, OTHER_ACCOUNT_ID } from './statements-harness.js';

const january = monthlyPeriod(2026, 0);

describe('statementId', () => {
  it('is a well-formed public identifier', () => {
    const id = statementId({ accountId: ACCOUNT_ID, period: january, format: StatementFormat.PDF });

    expect(id.startsWith('stm_')).toBe(true);
    expect(PREFIXED_ID_PATTERN.test(id)).toBe(true);
  });

  it('is the same identifier every time the same statement is described', () => {
    const first = statementId({
      accountId: ACCOUNT_ID,
      period: january,
      format: StatementFormat.PDF,
    });
    const second = statementId({
      accountId: ACCOUNT_ID,
      period: january,
      format: StatementFormat.PDF,
    });

    expect(first).toBe(second);
  });

  it('round-trips the period and the format', () => {
    const period = customPeriod('2026-01-05', '2026-02-04');
    const id = statementId({ accountId: ACCOUNT_ID, period, format: StatementFormat.OFX });
    const decoded = decodeStatementId(id, ACCOUNT_ID);

    expect(decoded?.format).toBe(StatementFormat.OFX);
    expect(decoded?.period.startDay).toBe('2026-01-05');
    expect(decoded?.period.endDay).toBe('2026-02-04');
  });

  it('separates the formats of one period', () => {
    const asPdf = statementId({
      accountId: ACCOUNT_ID,
      period: january,
      format: StatementFormat.PDF,
    });
    const asCsv = statementId({
      accountId: ACCOUNT_ID,
      period: january,
      format: StatementFormat.CSV,
    });

    expect(asPdf).not.toBe(asCsv);
  });

  it('refuses to resolve under another account', () => {
    const id = statementId({ accountId: ACCOUNT_ID, period: january, format: StatementFormat.PDF });

    expect(decodeStatementId(id, OTHER_ACCOUNT_ID)).toBeNull();
  });

  it('refuses anything that is not one of ours', () => {
    expect(decodeStatementId('stm_not-an-identifier', ACCOUNT_ID)).toBeNull();
    expect(decodeStatementId('acc_01JQ8Z00000000000000000001', ACCOUNT_ID)).toBeNull();
  });
});

describe('letterId', () => {
  const asOf = new Date('2026-03-04T00:00:00.000Z');

  it('round-trips the kind and the date it speaks of', () => {
    const id = letterId({ accountId: ACCOUNT_ID, kind: LetterKind.PROOF_OF_BALANCE, asOf });
    const decoded = decodeLetterId(id, ACCOUNT_ID);

    expect(decoded?.kind).toBe(LetterKind.PROOF_OF_BALANCE);
    expect(decoded?.asOf.toISOString()).toBe('2026-03-04T00:00:00.000Z');
  });

  it('gives the same reference to the same letter asked for twice', () => {
    const first = letterId({ accountId: ACCOUNT_ID, kind: LetterKind.BANK_REFERENCE, asOf });
    const second = letterId({ accountId: ACCOUNT_ID, kind: LetterKind.BANK_REFERENCE, asOf });

    expect(first).toBe(second);
  });

  it('refuses to resolve under another account', () => {
    const id = letterId({ accountId: ACCOUNT_ID, kind: LetterKind.BANK_REFERENCE, asOf });

    expect(decodeLetterId(id, OTHER_ACCOUNT_ID)).toBeNull();
  });
});
