/**
 * The message template studio.
 *
 * Templates are the bank's voice at the moments customers care about most — a payment
 * refused, a card frozen, a login from a new device. The editor puts the rendered message
 * beside the source, with sample values filled in, because nobody can read `{{amount}}`
 * and judge whether the sentence around it is the right thing to say.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { CommsTemplate } from '@reliance/api-client';
import { Alert, Badge, Button, StatusPill } from '@reliance/ui';

import { Panel, QueryState, opsKeys } from '@/components/ops';
import { DataTable, DetailDrawer, type DataColumn } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatInstant, humaniseCode } from '@/lib/format';

import { checkPlaceholders, renderPreview } from './placeholders';

/** Templates read per page. */
const PAGE_SIZE = 100;

const STATUS_TONE = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'neutral' } as const;

/** What the template is: its name, the key code looks it up by, and how it is sent. */
const IDENTITY_COLUMNS: readonly DataColumn<CommsTemplate>[] = [
  {
    id: 'name',
    header: 'Template',
    alwaysVisible: true,
    cell: (row) => row.name,
    csv: (row) => row.name,
  },
  {
    id: 'key',
    header: 'Key',
    cell: (row) => <span className="font-mono text-xs">{row.key}</span>,
    csv: (row) => row.key,
  },
  {
    id: 'channel',
    header: 'Channel',
    cell: (row) => humaniseCode(row.channel),
    csv: (row) => row.channel,
  },
  { id: 'locale', header: 'Language', cell: (row) => row.locale, csv: (row) => row.locale },
];

/** Where it stands, and when it last moved. */
const STATE_COLUMNS: readonly DataColumn<CommsTemplate>[] = [
  {
    id: 'status',
    header: 'State',
    alwaysVisible: true,
    cell: (row) => <StatusPill tone={STATUS_TONE[row.status]} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
  },
  {
    id: 'updatedAt',
    header: 'Updated (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.updatedAt)}</span>,
    csv: (row) => row.updatedAt,
    sortValue: (row) => row.updatedAt,
  },
];

function columns(onOpen: (template: CommsTemplate) => void): readonly DataColumn<CommsTemplate>[] {
  return [
    ...IDENTITY_COLUMNS,
    ...STATE_COLUMNS,
    {
      id: 'open',
      header: 'Review',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}

function PlaceholderReport({ template }: Readonly<{ template: CommsTemplate }>) {
  const report = checkPlaceholders(template.body, template.variables);

  if (report.ok) {
    return (
      <Alert tone="success" title="Every placeholder matches">
        The template uses exactly the values the messaging engine supplies.
      </Alert>
    );
  }

  return (
    <Alert tone="warning" title="Placeholders do not match">
      {report.undeclared.length > 0 && (
        <p>
          Used but not supplied: {report.undeclared.join(', ')}. These would reach the customer as
          literal braces.
        </p>
      )}
      {report.unused.length > 0 && <p>Supplied but never used: {report.unused.join(', ')}.</p>}
    </Alert>
  );
}

function TemplateDetail({ template }: Readonly<{ template: CommsTemplate }>) {
  return (
    <div className="flex flex-col gap-4">
      <PlaceholderReport template={template} />

      <section className="flex flex-col gap-2">
        <h3 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
          As the customer reads it
        </h3>
        <div className="border-border bg-surface-sunken flex flex-col gap-2 rounded-md border p-4">
          {template.subject && (
            <p className="font-display text-sm font-semibold">{renderPreview(template.subject)}</p>
          )}
          <p className="font-body text-fg text-sm whitespace-pre-wrap">
            {renderPreview(template.body)}
          </p>
        </div>
        <p className="font-body text-fg-muted text-xs">
          Shown with sample values. The messaging engine substitutes the customer&apos;s own when it
          sends.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
          Source
        </h3>
        <pre className="border-border overflow-x-auto rounded-md border p-3 font-mono text-xs">
          {template.body}
        </pre>
        <span className="flex flex-wrap gap-1.5">
          {template.variables.map((variable) => (
            <Badge key={variable} tone="accent">
              {variable}
            </Badge>
          ))}
        </span>
      </section>
    </div>
  );
}

/** The register: load, retry, table. */
function TemplateRegister({ onOpen }: { readonly onOpen: (template: CommsTemplate) => void }) {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.templates(),
    queryFn: async ({ signal }) => client.admin.templates({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <QueryState query={query} subject="the message templates">
      <DataTable
        tableId="ops-comms-templates"
        caption="Message templates"
        rowNoun="templates"
        columns={columns(onOpen)}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.id}
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        exportName="message-templates"
      />
    </QueryState>
  );
}

/** The template register and the preview behind it. */
export function TemplateStudio() {
  const [opened, setOpened] = useState<CommsTemplate | null>(null);

  return (
    <Panel
      title="Message templates"
      description="Every message the bank sends automatically, and exactly what it says."
      flush
    >
      <TemplateRegister onOpen={setOpened} />

      <DetailDrawer
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened?.name ?? 'Template'}
        subtitle={opened ? humaniseCode(opened.channel) : undefined}
        recordId={opened?.key}
      >
        {opened && <TemplateDetail template={opened} />}
      </DetailDrawer>
    </Panel>
  );
}
