/**
 * Saved views.
 *
 * An operator works one slice of a queue all day — "unassigned high-severity alerts,
 * oldest first, without the columns I never read". Rebuilding that every morning is how
 * a console loses its users. A saved view is that arrangement, named, kept in the
 * browser so it survives a reload.
 *
 * Deliberately local rather than server-side. A view is a personal working preference,
 * not a record of anything, and putting it on the platform would mean an audit event
 * every time an analyst re-sorted a column.
 */

/** Version prefix on every stored key, so a shape change discards rather than misreads. */
const STORAGE_VERSION = 'v1';

/** Column sort captured in a view. Mirrors the design system's table sort. */
export interface ViewSort {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

/** Everything a view remembers about how a table was arranged. */
export interface ViewState {
  /** Filter values, keyed by filter id. Empty strings are treated as "not set". */
  readonly filters: Readonly<Record<string, string>>;
  /** The active sort, or `null` for the table's default. */
  readonly sort: ViewSort | null;
  /** Columns the operator switched off. Everything else is visible. */
  readonly hiddenColumns: readonly string[];
}

/** A named arrangement of one table. */
export interface SavedView {
  readonly id: string;
  /** What the operator called it. */
  readonly name: string;
  /** ISO-8601 instant it was saved. */
  readonly savedAt: string;
  readonly state: ViewState;
}

/** A view state with nothing set — the table's own defaults. */
export const EMPTY_VIEW_STATE: ViewState = Object.freeze({
  filters: Object.freeze({}),
  sort: null,
  hiddenColumns: Object.freeze([]),
});

function storageKey(tableId: string): string {
  return `rb.ops.${STORAGE_VERSION}.views.${tableId}`;
}

function workingKey(tableId: string): string {
  return `rb.ops.${STORAGE_VERSION}.state.${tableId}`;
}

function isViewState(value: unknown): value is ViewState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ViewState>;
  return typeof candidate.filters === 'object' && Array.isArray(candidate.hiddenColumns);
}

function isSavedView(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SavedView>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.savedAt === 'string' &&
    isViewState(candidate.state)
  );
}

/**
 * Reads the operator's saved views for one table.
 *
 * Anything unreadable — corrupt JSON, a shape written by an older build, storage
 * disabled entirely — is treated as "no saved views". A lost preference is a small
 * annoyance; a console that will not render because of one is not.
 */
export function loadSavedViews(storage: Pick<Storage, 'getItem'>, tableId: string): SavedView[] {
  try {
    const raw = storage.getItem(storageKey(tableId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

/** Writes the operator's saved views for one table. A refused write is not an error. */
export function storeSavedViews(
  storage: Pick<Storage, 'setItem'>,
  tableId: string,
  views: readonly SavedView[],
): void {
  try {
    storage.setItem(storageKey(tableId), JSON.stringify(views));
  } catch {
    // Private browsing and full quotas both refuse writes. The view still applies for
    // this session; it just will not be there tomorrow.
  }
}

/**
 * Reads the arrangement a table was last left in, whether or not it was ever named.
 *
 * Columns an operator switched off are expected to stay off. Making them remember to
 * save a view first would mean the console forgets the adjustment they make most often.
 */
export function loadWorkingState(
  storage: Pick<Storage, 'getItem'>,
  tableId: string,
): ViewState | null {
  try {
    const raw = storage.getItem(workingKey(tableId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isViewState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Writes the arrangement a table is currently in. A refused write is not an error. */
export function storeWorkingState(
  storage: Pick<Storage, 'setItem'>,
  tableId: string,
  state: ViewState,
): void {
  try {
    storage.setItem(workingKey(tableId), JSON.stringify(state));
  } catch {
    // See `storeSavedViews`: the arrangement still applies for this session.
  }
}

/** Adds a view, replacing any existing one with the same name. */
export function upsertView(views: readonly SavedView[], view: SavedView): SavedView[] {
  const others = views.filter((candidate) => candidate.name !== view.name);
  return [...others, view];
}

/** Removes a view by id. */
export function removeView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((candidate) => candidate.id !== id);
}

/** True when a table is showing exactly what a saved view describes. */
export function matchesView(state: ViewState, view: SavedView): boolean {
  const sameSort =
    state.sort?.columnId === view.state.sort?.columnId &&
    state.sort?.direction === view.state.sort?.direction;

  const sameColumns =
    state.hiddenColumns.length === view.state.hiddenColumns.length &&
    state.hiddenColumns.every((id) => view.state.hiddenColumns.includes(id));

  return sameSort && sameColumns && sameFilters(state.filters, view.state.filters);
}

function sameFilters(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? '') !== (right[key] ?? '')) return false;
  }
  return true;
}
