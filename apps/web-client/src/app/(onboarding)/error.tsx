'use client';

/**
 * Failure boundary for account opening.
 *
 * Recovering here matters more than elsewhere: everything already accepted is on the server, so a
 * retry resumes rather than restarts, and the shared surface says so.
 */

export { RouteError as default } from '@/components/shell';
