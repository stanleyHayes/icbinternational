'use client';

/**
 * Opening an account.
 *
 * Three decisions and nothing else: which product, which currency, and what to call it. Anything
 * a bank could ask here that it can also infer — address, employment, identity — has already been
 * asked once during onboarding, and asking again is how an application gets abandoned.
 *
 * On success the customer is taken straight to the new account rather than back to a list, so the
 * sort code and account number they came for are the first thing they see.
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import type { Product } from '@reliance/contracts';
import { Button, Card, FormField, Input, Select, Skeleton } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { FailureAlert } from '@/components/transactions/form-parts';
import { describeError, fieldErrors, isValidationFailure } from '@/lib/errors';

import { ProductChoice } from './product-choice';
import { accountRoute } from './routes';
import { useOpenAccount, useProducts } from './use-accounts';

const NAME_MAX_LENGTH = 40;

function openable(products: readonly Product[]): readonly Product[] {
  return products.filter((product) => product.active);
}

interface DetailsProps {
  readonly currencies: readonly string[];
  readonly currency: string;
  readonly onCurrency: (value: string) => void;
  readonly nickname: string;
  readonly onNickname: (value: string) => void;
  readonly errors: Readonly<Record<string, string>>;
}

/** Currency and name: the two things the product itself does not decide. */
function Details(props: DetailsProps) {
  const { currencies, currency, onCurrency, nickname, onNickname, errors } = props;

  return (
    <Card className="flex flex-col gap-4">
      <FormField label="Currency" error={errors.currency}>
        <Select
          options={currencies.map((value) => ({ value, label: value }))}
          value={currency}
          onChange={(event) => onCurrency(event.target.value)}
        />
      </FormField>

      <FormField
        label="Name this account"
        hint="Optional. Only you see it, and you can change it whenever you like."
        error={errors.nickname}
      >
        <Input
          value={nickname}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => onNickname(event.target.value)}
        />
      </FormField>
    </Card>
  );
}

function Submit({ pending, disabled }: { readonly pending: boolean; readonly disabled: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" loading={pending} disabled={disabled}>
        Open this account
      </Button>
      <p className="text-fg-muted text-sm">
        You will get the sort code and account number straight away.
      </p>
    </div>
  );
}

/** The form, once the catalogue is known. */
function Form({ products }: { readonly products: readonly Product[] }) {
  const router = useRouter();
  const open = useOpenAccount();
  const [code, setCode] = useState(products[0]?.code ?? '');
  const [currency, setCurrency] = useState<string>(products[0]?.currencies[0] ?? '');
  const [nickname, setNickname] = useState('');

  const chosen = useMemo(() => products.find((product) => product.code === code), [products, code]);

  const chooseProduct = (nextCode: string): void => {
    setCode(nextCode);
    setCurrency(products.find((product) => product.code === nextCode)?.currencies[0] ?? '');
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    open.mutate(
      {
        productCode: code,
        currency: currency as Product['currencies'][number],
        additionalHolderEmails: [],
        ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
      },
      { onSuccess: (account) => router.push(accountRoute(account.id)) },
    );
  };

  const inline = isValidationFailure(open.error) ? fieldErrors(open.error) : {};

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <ProductChoice products={products} value={code} onChange={chooseProduct} />
      <Details
        currencies={chosen?.currencies ?? []}
        currency={currency}
        onCurrency={setCurrency}
        nickname={nickname}
        onNickname={setNickname}
        errors={inline}
      />
      <FailureAlert error={open.error} handledInline={Object.keys(inline).length > 0} />
      <Submit pending={open.isPending} disabled={!code || !currency} />
    </form>
  );
}

/**
 * @example <OpenAccountForm />
 */
export function OpenAccountForm() {
  const products = useProducts();

  if (products.isPending) return <Skeleton className="h-96 w-full" />;

  if (products.isError) {
    const described = describeError(products.error);
    return <EmptyPanel title={described.title} description={described.message} />;
  }

  const available = openable(products.data);

  if (available.length === 0) {
    return (
      <EmptyPanel
        title="Nothing to open right now"
        description="There is no account you can add to your profile at the moment. Call us on 0800 460 0460 and we will talk through what is available to you."
      />
    );
  }

  return <Form products={available} />;
}
