'use client';

/**
 * Applying for a loan.
 *
 * Deliberately one screen rather than a five-step wizard. Everything the API needs fits on a page,
 * and a customer part-way through a five-step lending application is a customer who abandons it —
 * which is worse for them than being asked five things at once.
 *
 * The representative rate is stated next to the product, and the screen says plainly that the rate
 * offered can differ. That is a regulatory requirement and, more to the point, it is true.
 */

import { useRouter } from 'next/navigation';

import type { Account } from '@reliance/contracts';
import { Alert, Button, FormField, Input, Select, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  laneRoutes,
  QueryPanel,
  Section,
  useUsableAccounts,
} from '@/components/transfers';

import { aprLabel } from './lending-look';
import { useApplicationForm } from './use-application-form';

const PURPOSE_MAX = 120;

/** Props for {@link ApplicationForm}. */
export interface ApplicationFormProps {
  /** A product code taken from `?product=`. */
  readonly initialProduct: string;
}

/**
 * @example <ApplicationForm initialProduct="PERSONAL_STANDARD" />
 */
export function ApplicationForm({ initialProduct }: ApplicationFormProps) {
  const router = useRouter();
  const accounts = useUsableAccounts();
  const form = useApplicationForm(initialProduct, (application) =>
    router.push(laneRoutes.borrow.application(application.id)),
  );

  return (
    <Section
      title="Apply"
      description="One page. We tell you where the application has got to as it moves."
    >
      <div className="flex flex-col gap-5">
        <FormAlert error={form.apply.error} />

        <QueryPanel query={form.products} skeletonRows={1}>
          {(list) => (
            <FormField label="What kind of borrowing?" required>
              <Select
                value={form.product?.code ?? ''}
                options={list.map((product) => ({
                  value: product.code,
                  label: `${product.name} · ${aprLabel(product.representativeAprBps)} representative APR`,
                }))}
                onChange={(event) => form.patch({ productCode: event.target.value })}
              />
            </FormField>
          )}
        </QueryPanel>

        <ApplicationFields form={form} accounts={accounts.data ?? []} />
        <RepresentativeNotice />

        <div className="flex justify-end">
          <Button disabled={!form.ready} loading={form.apply.isPending} onClick={form.submit}>
            Send this application
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Props for {@link ApplicationFields}. */
interface ApplicationFieldsProps {
  readonly form: ReturnType<typeof useApplicationForm>;
  readonly accounts: readonly Account[];
}

/** How much, for how long, what for, and where it lands. */
function ApplicationFields({ form, accounts }: ApplicationFieldsProps) {
  return (
    <>
      <AmountField
        label="How much you want to borrow"
        currency={form.currency}
        value={form.draft.amount}
        onChange={(amount) => form.patch({ amount })}
      />

      <FormField label="Over how many months" required>
        <Input
          type="number"
          inputMode="numeric"
          value={form.draft.termMonths}
          onChange={(event) => form.patch({ termMonths: event.target.value })}
        />
      </FormField>

      <FormField
        label="What is it for?"
        hint="A short description helps us assess it faster."
        required
      >
        <Textarea
          value={form.draft.purpose}
          maxLength={PURPOSE_MAX}
          showCount
          onChange={(event) => form.patch({ purpose: event.target.value })}
        />
      </FormField>

      <AccountSelect
        label="Pay the money into"
        accounts={accounts}
        value={form.draft.disbursementAccountId}
        onChange={(disbursementAccountId) => form.patch({ disbursementAccountId })}
        hideBalance
      />
    </>
  );
}

/** The representative-APR disclosure, which is both required and true. */
function RepresentativeNotice() {
  return (
    <Alert tone="info" title="About the rate">
      The rate above is representative. At least 51% of customers who take this product get it or
      better; the rate you are offered depends on your circumstances and is shown on the offer
      before you accept anything.
    </Alert>
  );
}
