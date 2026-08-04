/**
 * The sign-in screen.
 *
 * Three states and one decision between them: collect the credentials, ask for the
 * authenticator code, or explain a refusal that retrying will not fix.
 */

'use client';

import { Alert } from '@reliance/ui';

import { messageFor } from '@/lib/errors';
import { useAdminSession } from '@/lib/session';

import { CredentialsStep } from './credentials-step';
import { SignInRefusal } from './sign-in-refusal';
import { useSignIn } from './use-sign-in';
import { VerificationStep } from './verification-step';

export interface SignInFormProps {
  /** Where to go once signed in. Already validated as a path inside this console. */
  readonly returnTo: string;
}

/** Tells an operator who is already signed in, rather than asking them again. */
function AlreadySignedIn({ name }: Readonly<{ name: string }>) {
  return (
    <Alert tone="info" title="You are already signed in">
      This session belongs to {name}. Use the sign-out control in the console before signing in as
      somebody else.
    </Alert>
  );
}

/** Staff sign-in, with its mandatory second factor. */
export function SignInForm({ returnTo }: SignInFormProps) {
  const signIn = useSignIn(returnTo);
  const { operator } = useAdminSession();

  if (operator) return <AlreadySignedIn name={operator.fullName} />;

  if (signIn.isTerminal && signIn.error) {
    return <SignInRefusal error={signIn.error} onStartAgain={signIn.backToCredentials} />;
  }

  if (signIn.stage === 'verification') {
    return (
      <VerificationStep
        email={signIn.email}
        code={signIn.code}
        onCodeChange={signIn.setCode}
        onSubmit={signIn.submit}
        onBack={signIn.backToCredentials}
        isSubmitting={signIn.isSubmitting}
        error={signIn.error}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {signIn.error && <Alert tone="danger">{messageFor(signIn.error)}</Alert>}
      <CredentialsStep
        email={signIn.email}
        onEmailChange={signIn.setEmail}
        password={signIn.password}
        onPasswordChange={signIn.setPassword}
        onContinue={signIn.continueToVerification}
      />
    </div>
  );
}
