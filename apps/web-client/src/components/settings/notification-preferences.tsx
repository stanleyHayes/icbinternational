'use client';

/**
 * The category-by-channel preference matrix.
 *
 * A real table with row and column headers, so a screen reader announces "Card, Email, on" rather
 * than reading forty unlabelled switches. Security notifications are shown as fixed rather than
 * hidden: a customer who cannot find the switch assumes it exists somewhere, and telling them it
 * does not — and why — is the honest version.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  MANDATORY_CATEGORIES,
  type ChannelPreference,
  type NotificationPreferences,
} from '@reliance/contracts';
import { Alert, Switch } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** The channels, in the order people think about them. */
const CHANNELS = [
  { key: 'inApp', label: 'In the app' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'Text' },
  { key: 'push', label: 'Push' },
] as const satisfies readonly { key: keyof ChannelPreference; label: string }[];

/** What each category actually covers. */
const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  SECURITY: 'Security',
  TRANSACTION: 'Money in and out',
  ACCOUNT: 'Your accounts',
  CARD: 'Cards',
  LENDING: 'Borrowing',
  SAVINGS: 'Saving',
  SUPPORT: 'Support',
  STATEMENT: 'Statements',
  MARKETING: 'Offers from us',
  SYSTEM: 'Service updates',
};

/** True for the categories the bank will always send, whatever is set here. */
function isMandatory(category: string): boolean {
  return MANDATORY_CATEGORIES.includes(category as (typeof MANDATORY_CATEGORIES)[number]);
}

/** Saves the whole matrix; the API replaces it wholesale. */
function useSavePreferences() {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: NotificationPreferences) =>
      (await browserApi().notifications.updatePreferences(body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/** One row of the matrix: a category and its four channels. */
function PreferenceRow({
  row,
  onToggle,
}: {
  readonly row: ChannelPreference;
  readonly onToggle: (channel: keyof ChannelPreference, on: boolean) => void;
}) {
  const fixed = isMandatory(row.category);

  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className="text-fg py-3 pr-4 text-left text-sm font-medium">
        {CATEGORY_LABEL[row.category] ?? row.category}
        {fixed ? (
          <span className="text-fg-muted block text-xs font-normal">Always sent</span>
        ) : null}
      </th>
      {CHANNELS.map((channel) => (
        <td key={channel.key} className="py-3 pr-4">
          <Switch
            checked={Boolean(row[channel.key])}
            disabled={fixed}
            aria-label={`${CATEGORY_LABEL[row.category] ?? row.category} by ${channel.label}`}
            onChange={(event) => onToggle(channel.key, event.target.checked)}
          />
        </td>
      ))}
    </tr>
  );
}

/** The matrix, with a save on every change. */
function Matrix({ preferences }: { readonly preferences: NotificationPreferences }) {
  const save = useSavePreferences();

  const toggle = (category: string, channel: keyof ChannelPreference, on: boolean): void => {
    save.mutate({
      ...preferences,
      preferences: preferences.preferences.map((row) =>
        row.category === category ? { ...row, [channel]: on } : row,
      ),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <FormAlert error={save.error} />

      <Alert tone="info" title="Security messages always arrive">
        We will always tell you when somebody signs in, changes your details or moves a large sum.
        You cannot switch that off, and we would not want you to be able to.
      </Alert>

      <MatrixTable preferences={preferences} onToggle={toggle} />
    </div>
  );
}

/**
 * @example <NotificationPreferencesPanel />
 */
export function NotificationPreferencesPanel() {
  const preferences = useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: async () => (await browserApi().notifications.preferences()).data,
  });

  return (
    <Section title="How we contact you" description="Choose the channel for each kind of message.">
      <QueryPanel query={preferences} skeletonRows={4}>
        {(data) => <Matrix preferences={data} />}
      </QueryPanel>
    </Section>
  );
}

/** The grid itself, with real row and column headers. */
/** The kind of message, then one column per way of hearing about it. */
function ChannelHeader() {
  const cell = 'text-fg-muted py-2 pr-4 text-left text-xs font-medium';

  return (
    <thead>
      <tr className="border-border border-b">
        <th scope="col" className={cell}>
          What it is about
        </th>
        {CHANNELS.map((channel) => (
          <th key={channel.key} scope="col" className={cell}>
            {channel.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function MatrixTable({
  preferences,
  onToggle,
}: {
  readonly preferences: NotificationPreferences;
  readonly onToggle: (category: string, channel: keyof ChannelPreference, on: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-lg border-collapse text-sm">
        <caption className="sr-only">
          How you would like to hear from us, by kind of message
        </caption>
        <ChannelHeader />
        <tbody>
          {preferences.preferences.map((row) => (
            <PreferenceRow
              key={row.category}
              row={row}
              onToggle={(channel, on) => onToggle(row.category, channel, on)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
