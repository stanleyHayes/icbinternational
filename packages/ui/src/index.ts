/**
 * `@reliance/ui` — the Reliance Bank design system.
 *
 * Three layers, one import path:
 *  - **foundation** — brand tokens, semantic colour roles, typography presets, dark mode, icons
 *  - **primitives / composites** — accessible, keyboard-complete building blocks
 *  - **banking** — the components that carry the brand's money semantics
 *
 * Two rules the package exists to enforce. Money crosses every component boundary as a string of
 * integer minor units and is a `bigint` inside; there is no path from a prop to a float. Colour
 * meaning is fixed system-wide: credit green, debit `#D9534F`, pending gold — in tables, in card
 * art, in charts.
 *
 * Styling enters an app as CSS, not JS:
 * ```css
 * @import 'tailwindcss';
 * @import '@reliance/ui/styles/theme.css';
 * @import '@reliance/ui/styles/tailwind-theme.css';
 * ```
 */

/* ------------------------------------------------------------------ foundation */

export * from './foundation/icons.js';
export * from './foundation/styles.js';
export * from './foundation/theme-mode.js';
export * from './foundation/tokens.js';
export * from './foundation/typography.js';

/* ------------------------------------------------------------------------- lib */

export * from './lib/cn.js';
export * from './lib/minor-units.js';

/* ----------------------------------------------------------------------- hooks */

export {
  useControllableState,
  type ControllableStateOptions,
} from './hooks/use-controllable-state.js';
export {
  useDismissableLayer,
  type DismissableLayerOptions,
} from './hooks/use-dismissable-layer.js';
export { useMergedRefs } from './hooks/use-merged-refs.js';

/* ------------------------------------------------------------------ primitives */

export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './primitives/button.js';
export { Checkbox, type CheckboxProps } from './primitives/checkbox.js';
export { CurrencyInput, type CurrencyInputProps } from './primitives/currency-input.js';
export {
  FieldContext,
  useFieldContext,
  useFieldControl,
  type FieldContextValue,
  type FieldControlAttributes,
} from './primitives/field-context.js';
export { FieldError, type FieldErrorProps } from './primitives/field-error.js';
export { FormField, type FormFieldProps } from './primitives/form-field.js';
export { Input, type InputProps, type InputSize } from './primitives/input.js';
export { Label, type LabelProps } from './primitives/label.js';
export { OTP_LENGTH, OTPInput, type OTPInputProps } from './primitives/otp-input.js';
export { Radio, type RadioProps } from './primitives/radio.js';
export { RadioGroup, type RadioGroupProps } from './primitives/radio-group.js';
export {
  Select,
  type SelectOption,
  type SelectProps,
  type SelectSize,
} from './primitives/select.js';
export { Spinner, type SpinnerProps } from './primitives/spinner.js';
export { Switch, type SwitchProps } from './primitives/switch.js';
export { Textarea, type TextareaProps } from './primitives/textarea.js';

/* ------------------------------------------------------------------ composites */

export { Alert, type AlertProps } from './composites/alert.js';
export { Avatar, initialsFrom, type AvatarProps, type AvatarSize } from './composites/avatar.js';
export { Badge, type BadgeProps, type BadgeSize, type BadgeVariant } from './composites/badge.js';
export {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  type CardElevation,
  type CardHeaderProps,
  type CardProps,
} from './composites/card.js';
export { Dialog, type DialogProps, type DialogSize } from './composites/dialog.js';
export { Drawer, type DrawerProps, type DrawerSide } from './composites/drawer.js';
export { EmptyState, type EmptyStateProps } from './composites/empty-state.js';
export { ErrorState, type ErrorStateProps } from './composites/error-state.js';
export { Pagination, paginationRange, type PaginationProps } from './composites/pagination.js';
export {
  Skeleton,
  SkeletonText,
  type SkeletonProps,
  type SkeletonShape,
} from './composites/skeleton.js';
export { StatusPill, type StatusPillProps } from './composites/status-pill.js';
export { Stepper, type Step, type StepperProps, type StepStatus } from './composites/stepper.js';
export { Table, type TableColumn, type TableProps } from './composites/table.js';
export {
  ARIA_SORT,
  compareValues,
  sortRows,
  type SortDirection,
  type SortValue,
  type TableSort,
} from './composites/table-sort.js';
export {
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from './composites/tabs.js';
export { type TabsOrientation } from './composites/tabs-context.js';
export { Toast, type ToastItem, type ToastProps } from './composites/toast.js';
export { ToastProvider, useToast, type ToastApi } from './composites/toast-provider.js';
export {
  DEFAULT_TOAST_DURATION_MS,
  MAX_VISIBLE_TOASTS,
  useToastQueue,
  type ToastInput,
  type ToastQueue,
} from './composites/use-toast-queue.js';
export { BANNER_TONE, DOT_TONE, SOFT_TONE, SOLID_TONE, type Tone } from './composites/tone.js';
export { Tooltip, type TooltipProps, type TooltipSide } from './composites/tooltip.js';

/* --------------------------------------------------------------------- banking */

export { AccountCard, maskNumber, type AccountCardProps } from './banking/account-card.js';
export { BalanceCard, type BalanceCardProps, type LabelledAmount } from './banking/balance-card.js';
export {
  CardArt,
  type CardArtProps,
  type CardMedium,
  type CardNetwork,
  type CardTier,
} from './banking/card-art.js';
export { LimitMeter, usedPercent, type LimitMeterProps } from './banking/limit-meter.js';
export { MoneyText, type MoneyTextProps, type MoneyTextSize } from './banking/money-text.js';
export { moneyDirection, moneyRole, moneyTextClass } from './banking/money-tone.js';
export {
  ProgressRing,
  savedPercent,
  type ProgressRingProps,
  type ProgressRingSize,
} from './banking/progress-ring.js';
export { RateTicker, type RateTickerProps, type RateTrend } from './banking/rate-ticker.js';
export { TransactionRow, type TransactionRowProps } from './banking/transaction-row.js';
