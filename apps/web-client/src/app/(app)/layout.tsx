import type { ReactNode } from 'react';

import { AppFrame } from '@/components/shell';

/**
 * The signed-in application.
 *
 * One job: put every screen inside the shell. The frame owns the sidebar, the top bar, the
 * account switcher, the command palette and the single `<main>` that the skip link targets, so a
 * feature screen renders its own content and nothing else.
 *
 * The session is deliberately *not* checked here. A layout cannot see the path being rendered, so
 * a guard at this level would have to send everyone to a generic sign-in URL and lose the page
 * they were trying to reach. Each page calls `requireSession` with its own path instead, which is
 * what puts the customer back where they started once they have signed in.
 */
export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
