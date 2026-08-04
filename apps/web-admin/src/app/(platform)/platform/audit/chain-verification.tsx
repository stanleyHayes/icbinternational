/**
 * Verifying the audit chain end to end.
 *
 * The console can only judge the page in front of it: adjacent events, adjacent hashes.
 * The platform walks the whole chain, and that is a different and stronger statement — so
 * the result is shown separately rather than folded into the page-level check, and the
 * sequence number of the first broken link is named, because "something is wrong
 * somewhere" is not something anyone can act on.
 */

'use client';

import { useMutation } from '@tanstack/react-query';

import { Alert, Button } from '@reliance/ui';

import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatCount, formatInstant } from '@/lib/format';

/** The result of a full-chain verification. */
export function ChainVerification() {
  const client = useApiClient();

  const verify = useMutation({
    mutationFn: async () => (await client.admin.verifyAuditChain()).data,
  });

  const result = verify.data;

  return (
    <div className="flex flex-col gap-3">
      {verify.error && <Alert tone="danger">{messageFor(verify.error)}</Alert>}

      {result && result.verified && (
        <Alert tone="success" title="The whole chain holds">
          {formatCount(result.eventsChecked)} events checked at {formatInstant(result.checkedAt)}.
          Every event links correctly to the one before it, back to the first record the bank ever
          wrote.
        </Alert>
      )}

      {result && !result.verified && (
        <Alert tone="danger" title="The chain is broken">
          The link breaks at sequence {result.firstBrokenSequence}. Every event after that point is
          unproven. Stop and raise this with the security desk immediately — an audit log that can
          be altered is not an audit log.
        </Alert>
      )}

      <div>
        <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
          {result ? 'Verify the chain again' : 'Verify the whole chain'}
        </Button>
      </div>
    </div>
  );
}
