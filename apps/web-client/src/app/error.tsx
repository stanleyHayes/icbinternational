'use client';

/**
 * The root failure boundary.
 *
 * The `(auth)` and `(onboarding)` groups already delegate to the shell's shared surface; this
 * catches everything outside them, so a throw in the root layout's tree still lands on the
 * bank's own error screen rather than Next's default.
 */

export { RouteError as default } from '@/components/shell';
