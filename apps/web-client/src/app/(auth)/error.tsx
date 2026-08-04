'use client';

/**
 * Failure boundary for the authentication screens.
 *
 * Uses the shell's shared error surface so a customer sees the same wording here as anywhere else
 * in the app — including the reassurance that nothing has moved, which matters most on the screens
 * somebody reaches when they are already worried.
 */

export { RouteError as default } from '@/components/shell';
