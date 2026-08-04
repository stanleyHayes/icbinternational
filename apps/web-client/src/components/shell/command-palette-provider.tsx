'use client';

/**
 * Owns the palette's open state and the keyboard shortcut that reveals it.
 *
 * The shortcut is bound at the document, but it deliberately does nothing while the customer is
 * typing into a field. ⌘K inside an amount box should not throw a search dialog over a half-typed
 * payment.
 */

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { signOut } from '@/lib/auth-client';
import { SignInReason, signInWithReturn } from '@/lib/routes';

import { commandItems } from './command-items';
import { CommandPalette } from './command-palette';

const SHORTCUT_KEY = 'k';
const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Opening the palette from anywhere in the app. */
export interface CommandPaletteApi {
  readonly open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteApi | null>(null);

/**
 * The palette, for a button that wants to open it.
 *
 * @throws when called outside {@link CommandPaletteProvider}.
 */
export function useCommandPalette(): CommandPaletteApi {
  const context = useContext(CommandPaletteContext);
  if (!context)
    throw new Error('useCommandPalette must be called inside <CommandPaletteProvider>.');
  return context;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return EDITABLE.has(element.tagName) || element.isContentEditable;
}

/** Mount inside the application shell. */
export function CommandPaletteProvider({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [showing, setShowing] = useState(false);

  const handleSignOut = useCallback(() => {
    void signOut().then(() => {
      router.replace(signInWithReturn(null, SignInReason.SIGNED_OUT));
      router.refresh();
    });
  }, [router]);

  const items = useMemo(() => commandItems(handleSignOut), [handleSignOut]);
  const api = useMemo<CommandPaletteApi>(() => ({ open: () => setShowing(true) }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === SHORTCUT_KEY;
      if (!chord || isTyping(event.target)) return;
      event.preventDefault();
      setShowing((previous) => !previous);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <CommandPaletteContext.Provider value={api}>
      {children}
      <CommandPalette open={showing} onClose={() => setShowing(false)} items={items} />
    </CommandPaletteContext.Provider>
  );
}
