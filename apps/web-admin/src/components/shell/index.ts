/**
 * The console shell.
 *
 * A feature screen normally needs nothing from here — the chrome, the navigation and the
 * search palette are already wrapped around it by the root layout. The exceptions are
 * `NAV_SECTIONS`, when a screen wants to link to another section by its canonical path,
 * and the shell's own pieces, when a screen legitimately needs to render one itself.
 *
 * For the building blocks a screen actually assembles — tables, filters, drawers,
 * decisions — import `@/components/shell/ops`.
 */

export { AppFrame } from './app-frame';
export { ConsoleShell } from './console-shell';
export { CustomerContextBanner } from './customer-context-banner';
export { OperatorIdentity } from './operator-identity';
export { RelianceMark, type RelianceMarkProps } from './reliance-mark';
export { ThemeToggle } from './theme-toggle';
export { TopBar, type TopBarProps } from './top-bar';

export { NavLink, type NavLinkProps } from './nav/nav-link';
export {
  isItemVisible,
  landingItem,
  visibleItems,
  visibleSections,
  type NavItem,
  type NavSection,
} from './nav/nav-model';
export { NAV_SECTIONS } from './nav/nav-sections';
export { SidebarNav, type SidebarNavProps } from './nav/sidebar';

export { CommandPalette, type CommandPaletteProps } from './search/command-palette';
export { resolveEntityJump, type EntityJump } from './search/entity-jump';
export { useCommandPalette, type CommandPaletteState } from './search/use-command-palette';
export {
  MIN_SEARCH_LENGTH,
  useGlobalSearch,
  type GlobalSearchState,
} from './search/use-global-search';
