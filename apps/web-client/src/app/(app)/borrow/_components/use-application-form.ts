'use client';

/**
 * The state behind a loan application.
 *
 * An application is a commitment, so the API takes one request with everything in it rather than a
 * partially-saved draft the customer might forget about. The wizard's job is to gather it; this is
 * where the gathering lives.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';

import type {
  CreateLoanApplicationRequest,
  LoanApplication,
  LoanProduct,
} from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const DEFAULT_TERM = '36';

/** Everything the application wizard gathers. */
export interface ApplicationDraft {
  readonly productCode: string;
  readonly amount: string;
  readonly termMonths: string;
  readonly purpose: string;
  readonly disbursementAccountId: string;
}

/** What {@link useApplicationForm} hands the wizard. */
export interface ApplicationForm {
  readonly draft: ApplicationDraft;
  readonly patch: (patch: Partial<ApplicationDraft>) => void;
  readonly products: UseQueryResult<LoanProduct[]>;
  readonly product: LoanProduct | undefined;
  readonly currency: CurrencyCode;
  readonly ready: boolean;
  readonly apply: UseMutationResult<LoanApplication, unknown, CreateLoanApplicationRequest>;
  readonly submit: () => void;
}

/** Sends the application and refreshes everything the borrowing screens read. */
function useApply(
  cache: ReturnType<typeof useQueryClient>,
  onApplied: (application: LoanApplication) => void,
) {
  return useMutation({
    mutationFn: async (body: CreateLoanApplicationRequest) =>
      (await browserApi().borrow.apply(body)).data,
    onSuccess: async (application) => {
      await cache.invalidateQueries({ queryKey: movementKeys.borrow.all });
      onApplied(application);
    },
  });
}

/**
 * @param initialProduct a product code taken from `?product=`, when the customer arrived from one.
 * @param onApplied where to go once the application exists.
 */
export function useApplicationForm(
  initialProduct: string,
  onApplied: (application: LoanApplication) => void,
): ApplicationForm {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<ApplicationDraft>({
    productCode: initialProduct,
    amount: '',
    termMonths: DEFAULT_TERM,
    purpose: '',
    disbursementAccountId: '',
  });

  const products = useQuery({
    queryKey: movementKeys.borrow.products(),
    queryFn: async () => (await browserApi().borrow.products()).data,
  });

  const apply = useApply(cache, onApplied);

  // Falls back to the first product so the form has something priced to show before the
  // customer has chosen: an empty rate and term is a worse first impression than a default.
  const product =
    products.data?.find((candidate) => candidate.code === draft.productCode) ?? products.data?.[0];
  const currency: CurrencyCode = product?.currency ?? 'GBP';
  const ready = isComplete(draft, product);

  const submit = (): void => {
    if (!ready || !product) return;
    apply.mutate(requestFrom(draft, product.code, currency));
  };

  return {
    draft,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    products,
    product,
    currency,
    ready,
    apply,
    submit,
  };
}

/** Every field the platform requires, plus a product to price it against. */
function isComplete(draft: ApplicationDraft, product: LoanProduct | undefined): boolean {
  return Boolean(
    product &&
    draft.amount &&
    draft.termMonths &&
    draft.purpose.trim() &&
    draft.disbursementAccountId,
  );
}

/** The application body, built from the draft once every required field is present. */
function requestFrom(
  draft: ApplicationDraft,
  productCode: string,
  currency: CurrencyCode,
): CreateLoanApplicationRequest {
  return {
    productCode,
    amount: { amount: draft.amount, currency },
    termMonths: Number(draft.termMonths),
    purpose: draft.purpose.trim(),
    disbursementAccountId: draft.disbursementAccountId,
  };
}
