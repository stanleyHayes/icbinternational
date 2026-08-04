'use client';

/**
 * The foot of the sidebar: who is signed in, how the app looks, and the way out.
 *
 * Sign-out is a real button with a real busy state. A bank's sign-out that appears to do nothing
 * for two seconds is a bank's sign-out that gets clicked four times on a shared machine.
 */

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Avatar, Button, cn, Skeleton, TEXT_STYLE } from '@reliance/ui';

import { signOut } from '@/lib/auth-client';
import { SignInReason, signInWithReturn } from '@/lib/routes';
import { fullName, useSessionUser } from '@/lib/use-session-user';

import { ThemeToggle } from './theme-toggle';

function SignedInAs() {
  const { data: user, isPending } = useSessionUser();

  if (isPending || !user) {
    return (
      <div className="flex items-center gap-3 px-1">
        <Skeleton shape="circle" className="size-8 shrink-0" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 px-1">
      <Avatar
        name={fullName(user)}
        {...(user.avatarUrl ? { src: user.avatarUrl } : {})}
        size="sm"
      />
      <div className="min-w-0">
        <p className={cn(TEXT_STYLE.label, 'truncate')}>{fullName(user)}</p>
        <p className="text-fg-subtle truncate text-xs">{user.email}</p>
      </div>
    </div>
  );
}

/** Account summary, appearance control and sign-out. */
export function SidebarFooter() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function handleSignOut(): Promise<void> {
    setLeaving(true);
    await signOut();
    router.replace(signInWithReturn(null, SignInReason.SIGNED_OUT));
    router.refresh();
  }

  return (
    <div className="border-border flex flex-col gap-3 border-t pt-4">
      <SignedInAs />
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          loading={leaving}
          onClick={() => void handleSignOut()}
          startIcon={<LogOut aria-hidden="true" className="size-4" />}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
