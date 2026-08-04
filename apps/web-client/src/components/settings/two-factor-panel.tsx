'use client';

/**
 * The second step, and the passkeys that can replace it.
 *
 * Recovery codes are treated as a first-class thing rather than a footnote: an authenticator app
 * on a lost phone with no recovery codes is a locked-out customer and a phone call, and the moment
 * to prevent that is here.
 */

import { useMutation } from '@tanstack/react-query';

import { Alert, Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { useSessionUser } from '@/lib/use-session-user';

/** Fresh recovery codes. The previous set stops working the moment these are issued. */
function RecoveryCodes() {
  const regenerate = useMutation({
    mutationFn: async () => (await browserApi().mfa.regenerateRecoveryCodes()).data,
  });

  return (
    <Section
      title="Recovery codes"
      description="Ten one-time codes for the day you cannot reach your authenticator."
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={regenerate.error} />

        <CodeList codes={regenerate.data?.codes} />

        <div>
          <Button
            variant="secondary"
            loading={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            Generate new recovery codes
          </Button>
        </div>
      </div>
    </Section>
  );
}

/**
 * @example <TwoFactorPanel />
 */
export function TwoFactorPanel() {
  const user = useSessionUser();
  const methods = user.data?.mfaMethods ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Second step"
        description="An extra check when you sign in from somewhere we do not recognise."
      >
        {user.data?.mfaEnabled ? (
          <p className="text-fg text-sm">
            Turned on, using {methods.length === 1 ? 'one method' : `${methods.length} methods`}. We
            ask for it when something looks unusual, and always before a large payment.
          </p>
        ) : (
          <Alert tone="warning" title="You have not set up a second step">
            Without one, your password is the only thing between somebody and your money. Setting
            one up takes about a minute.
          </Alert>
        )}
      </Section>

      <RecoveryCodes />
    </div>
  );
}

/** The codes themselves, shown once and never again. */
function CodeList({ codes }: { readonly codes: readonly string[] | undefined }) {
  if (!codes) return null;

  return (
    <div role="status" aria-live="polite">
      <Alert tone="warning" title="Write these down now">
        <p>
          This is the only time we will show them. Each one works once. Keep them somewhere that is
          not your phone.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">
          {codes.map((code) => (
            <li key={code} className="select-all">
              {code}
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}
