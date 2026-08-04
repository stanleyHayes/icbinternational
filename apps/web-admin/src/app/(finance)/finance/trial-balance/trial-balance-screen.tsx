/**
 * The trial balance.
 *
 * One screen, one assertion: total debits equal total credits, per currency. Everything
 * else on it exists to let an operator find out why when they do not.
 *
 * The difference is rendered from live data, not from a stored flag, so a book that stops
 * footing shows it here first — which is the whole reason this screen is the first one a
 * financial controller opens.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Money, TrialBalance } from '@reliance/contracts';
import { CURRENCY_CODES, type CurrencyCode } from '@reliance/money';
import { Button, MoneyText, Select } from '@reliance/ui';

import { BalanceAssertion, exportTrialBalance, TrialBalanceTable } from '@/components/finance';
import { KpiTile, OpsScreen, Panel, QueryState, isZeroMinor, opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, formatInstant } from '@/lib/format';

/** Currencies the bank keeps a general ledger in. */
const LEDGER_CURRENCIES: ReadonlySet<CurrencyCode> = new Set<CurrencyCode>(['GBP', 'EUR', 'USD']);

const CURRENCY_OPTIONS = CURRENCY_CODES.filter((code) => LEDGER_CURRENCIES.has(code)).map(
  (value) => ({ value, label: value }),
);

function Figures({ balance, balanced }: Readonly<{ balance: TrialBalance; balanced: boolean }>) {
  const figure = (amount: Money) => (
    <MoneyText amount={amount.amount} currency={amount.currency} size="xl" muted />
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Total debits"
        value={figure(balance.totalDebits)}
        hint="Assets and expenses across the whole book."
      />
      <KpiTile
        label="Total credits"
        value={figure(balance.totalCredits)}
        hint="Liabilities, equity and income across the whole book."
      />
      <KpiTile
        label="Difference"
        tone={balanced ? 'success' : 'danger'}
        value={figure(balance.difference)}
        hint={balanced ? 'Zero, as it must be.' : 'Stop posting and escalate.'}
      />
      <KpiTile
        label="Accounts"
        value={formatCount(balance.lines.length)}
        hint={`As at ${formatInstant(balance.asOf)}.`}
      />
    </div>
  );
}

interface ControlsProps {
  readonly currency: CurrencyCode;
  readonly onCurrencyChange: (currency: CurrencyCode) => void;
  readonly balance: TrialBalance | undefined;
}

function Controls({ currency, onCurrencyChange, balance }: ControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        selectSize="sm"
        aria-label="Ledger currency"
        value={currency}
        options={CURRENCY_OPTIONS}
        onChange={(event) => onCurrencyChange(event.target.value as CurrencyCode)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!balance}
        onClick={() => balance && exportTrialBalance(balance, new Date().toISOString())}
      >
        Export
      </Button>
    </div>
  );
}

/** The trial balance for one currency, with the assertion above it. */
export function TrialBalanceScreen() {
  const client = useApiClient();
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');

  const query = useQuery({
    queryKey: opsKeys.trialBalance(currency),
    queryFn: async ({ signal }) => (await client.admin.trialBalance({ currency }, { signal })).data,
  });

  const balance = query.data;
  const balanced = balance ? isZeroMinor(balance.difference.amount) : true;

  return (
    <OpsScreen
      title="Trial balance"
      description="Every general-ledger account, proving the book sums to zero."
      actions={<Controls currency={currency} onCurrencyChange={setCurrency} balance={balance} />}
    >
      <QueryState query={query} subject="the trial balance">
        {balance && (
          <div className="flex flex-col gap-4">
            <Figures balance={balance} balanced={balanced} />

            <BalanceAssertion
              balanced={balanced}
              difference={balance.difference}
              subject="the trial balance"
            />

            <Panel
              title={`Ledger accounts in ${balance.currency}`}
              description="Grouped by account type, in the order a trial balance is read."
              flush
            >
              <TrialBalanceTable balance={balance} />
            </Panel>
          </div>
        )}
      </QueryState>
    </OpsScreen>
  );
}
