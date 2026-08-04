/**
 * The application shell.
 *
 * Everything a feature screen needs from the frame is exported here, so a screen imports from
 * `@/components/shell` and never reaches into a file inside it. That boundary is what lets the
 * shell be rearranged without touching fifteen feature routes.
 *
 * **Every module in this directory is a client component.** `@reliance/ui` does not carry
 * `'use client'` markers of its own, so anything that touches it has to declare the boundary
 * itself. A server component may import from here, but the thing it imports will be a client
 * component — which is what you want for all of this anyway.
 *
 * Wiring a new screen:
 *
 * ```tsx
 * // app/(app)/layout.tsx
 * import { AppFrame } from '@/components/shell';
 * export default function Layout({ children }: { children: ReactNode }) {
 *   return <AppFrame>{children}</AppFrame>;
 * }
 *
 * // app/(app)/cards/loading.tsx
 * import { RouteLoading } from '@/components/shell';
 * export default function Loading() { return <RouteLoading rows={4} />; }
 *
 * // app/(app)/cards/error.tsx
 * 'use client';
 * export { RouteError as default } from '@/components/shell';
 * ```
 */

export { AppFrame } from './app-frame';
export { BrandLockup, BrandMark } from './brand-mark';
export { useCommandPalette, type CommandPaletteApi } from './command-palette-provider';
export {
  EmptyPanel,
  NoResultsPanel,
  type EmptyPanelProps,
  type NoResultsPanelProps,
} from './empty-panel';
export { FormAlert, FormNotice, type FormAlertProps, type FormNoticeProps } from './form-alert';
export { FullPageLoader } from './full-page-loader';
export { LinkButton, type LinkButtonProps, type LinkButtonVariant } from './link-button';
export { NotificationList, type NotificationListProps } from './notification-list';
export { PageHeader, type PageHeaderProps } from './page-header';
export { RouteError, type RouteErrorProps } from './route-error';
export { RouteLoading, type RouteLoadingProps } from './route-loading';
export { MAIN_CONTENT_ID, SkipLink } from './skip-link';
export { StepUpCancelled, StepUpProvider, useStepUp, type StepUpApi } from './step-up-provider';
export { ThemeProvider, useTheme, type ThemeApi } from './theme-provider';
export { ThemeToggle } from './theme-toggle';
export { usePopover, type Popover } from './use-popover';
