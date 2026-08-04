/// <reference types="jest" />
/**
 * The two CSV failures that matter in a bank: a shifted column, and a cell that runs as
 * a formula on the analyst's machine.
 */

import { csvFilename, toCsv, toCsvRow, type CsvColumn } from './csv';

interface Row {
  readonly reference: string;
  readonly note: string;
}

const columns: readonly CsvColumn<Row>[] = [
  { header: 'Reference', value: (row) => row.reference },
  { header: 'Note', value: (row) => row.note },
];

describe('toCsvRow', () => {
  it('leaves ordinary values untouched', () => {
    expect(toCsvRow(['ACME', '250.00'])).toBe('ACME,250.00');
  });

  it('quotes a value containing a comma so the column count survives', () => {
    expect(toCsvRow(['Boateng, Amara'])).toBe('"Boateng, Amara"');
  });

  it('doubles embedded quotes', () => {
    expect(toCsvRow(['He said "no"'])).toBe('"He said ""no"""');
  });

  it('quotes a value containing a newline', () => {
    expect(toCsvRow(['line one\nline two'])).toBe('"line one\nline two"');
  });

  it.each(['=SUM(A1:A9)', '+1', '-1', '@import'])(
    'neutralises %s so a spreadsheet does not execute it',
    (dangerous) => {
      expect(toCsvRow([dangerous])).toBe(`'${dangerous}`);
    },
  );

  it('still quotes a neutralised value that also contains a comma', () => {
    expect(toCsvRow(['=A1,B1'])).toBe(`"'=A1,B1"`);
  });
});

describe('toCsv', () => {
  it('writes the header first and separates records with CRLF', () => {
    const csv = toCsv(columns, [
      { reference: 'RB-1', note: 'Cleared' },
      { reference: 'RB-2', note: 'Held' },
    ]);

    expect(csv).toBe('Reference,Note\r\nRB-1,Cleared\r\nRB-2,Held');
  });

  it('writes only the header when there are no rows', () => {
    expect(toCsv(columns, [])).toBe('Reference,Note');
  });
});

describe('csvFilename', () => {
  it('produces a sortable name to the second', () => {
    expect(csvFilename('approvals', '2026-08-03T14:22:07.123Z')).toBe(
      'approvals-20260803-142207.csv',
    );
  });
});
