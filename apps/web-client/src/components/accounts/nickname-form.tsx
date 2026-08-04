'use client';

/**
 * Naming an account.
 *
 * A customer with three current accounts cannot tell them apart by product name, and picking the
 * wrong one as the source of a transfer is a real mistake with real consequences. The name is
 * theirs, it is theirs alone, and clearing the field puts the product name back rather than
 * leaving an account with no label at all.
 */

import { useState, type FormEvent } from 'react';

import type { Account } from '@reliance/contracts';
import { Card, CardHeader, FormField, Input } from '@reliance/ui';

import { FailureAlert, SaveRow } from '@/components/transactions/form-parts';
import { fieldErrors, isValidationFailure } from '@/lib/errors';

import { useUpdateAccount } from './use-accounts';

const NAME_MAX_LENGTH = 40;

/** Props for {@link NicknameForm}. */
export interface NicknameFormProps {
  readonly account: Account;
}

/**
 * @example <NicknameForm account={account} />
 */
export function NicknameForm({ account }: NicknameFormProps) {
  const update = useUpdateAccount(account.id);
  const [name, setName] = useState(account.nickname ?? '');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    update.mutate({ nickname: name.trim() || null });
  };

  const inlineError = isValidationFailure(update.error) ? fieldErrors(update.error).nickname : null;
  const unchanged = name.trim() === (account.nickname ?? '');

  return (
    <Card>
      <CardHeader
        title="Name this account"
        description="Only you see this name. It appears everywhere you choose an account, so make it the one you would say out loud."
      />
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <FormField
          label="Account name"
          hint={`Leave it empty to go back to “${account.productName}”.`}
          error={inlineError}
        >
          <Input
            value={name}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>

        <FailureAlert error={update.error} handledInline={Boolean(inlineError)} />
        <SaveRow
          label="Save name"
          pending={update.isPending}
          disabled={unchanged}
          saved={update.isSuccess && unchanged}
        />
      </form>
    </Card>
  );
}
