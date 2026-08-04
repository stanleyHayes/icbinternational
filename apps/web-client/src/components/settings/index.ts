/**
 * The settings lane's components.
 *
 * Exported once so a settings page imports from `@/components/settings` and never reaches into a
 * file inside it. Every module here is a client component: `@reliance/ui` ships no `'use client'`
 * markers of its own, so anything touching it declares the boundary itself.
 */

export { DevicesPanel, TrustedDevices } from './devices-panel';
export { LimitsPanel, type LimitRow, type LimitsPanelProps } from './limits-panel';
export { NotificationPreferencesPanel } from './notification-preferences';
export { PasswordForm } from './password-form';
export { PreferencesPanel } from './preferences-panel';
export { PrivacyPanel } from './privacy-panel';
export { ProfileForm } from './profile-form';
export { SettingsNav } from './settings-nav';
export { TwoFactorPanel } from './two-factor-panel';
