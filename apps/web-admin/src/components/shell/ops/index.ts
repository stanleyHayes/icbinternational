/**
 * The operational primitives every console screen is built from.
 *
 * Import from here rather than from the individual files: these are a set, and a queue
 * assembled out of a `DataTable`, a `FilterBar` and a `DetailDrawer` behaves the same as
 * every other queue in the console, which is the whole point of having them.
 *
 * ```tsx
 * import { DataTable, DetailDrawer, FilterBar, type DataColumn } from '@/components/shell/ops';
 * ```
 */

export { brokenLinks, isChainIntact } from './audit-chain';
export { AuditEventRow, type AuditEventRowProps } from './audit-event-row';
export { AuditTrail, type AuditTrailProps } from './audit-trail';
export { ColumnDialog, type ColumnDialogProps, type ToggleableColumn } from './column-dialog';
export { DataTable } from './data-table';
export type { DataColumn, DataTableProps } from './data-table-types';
export { DataTableToolbar, type DataTableToolbarProps } from './data-table-toolbar';
export { DecisionPanel, type DecisionOutcome, type DecisionPanelProps } from './decision-panel';
export {
  DetailDrawer,
  DetailField,
  DetailSection,
  type DetailDrawerProps,
  type DetailFieldProps,
  type DetailSectionProps,
} from './detail-drawer';
export { DualApprovalBadge, type DualApprovalBadgeProps } from './dual-approval-badge';
export { FilterBar, type FilterBarProps, type FilterKind, type FilterSpec } from './filter-bar';
export { useDataTable, type DataTableController } from './use-data-table';
export { useTableState, type TableState, type TableStateOptions } from './use-table-state';
export { ViewPicker, type ViewPickerProps } from './view-picker';
