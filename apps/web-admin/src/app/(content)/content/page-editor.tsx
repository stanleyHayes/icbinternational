/**
 * The page editor.
 *
 * Content, search metadata, a preview and the history, with the publish controls fixed at
 * the bottom so they are reachable from any of them. Saving and publishing are separate
 * actions on purpose: an editor saving a half-finished paragraph before lunch must not
 * discover they have put it in front of customers.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { CmsPage } from '@reliance/contracts';
import {
  Alert,
  Button,
  FormField,
  Input,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
} from '@reliance/ui';

import { opsKeys } from '@/components/ops';
import { DetailDrawer } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';

import { BlockEditor } from './block-editor';
import { PagePreview } from './page-preview';
import { PublishControls } from './publish-controls';
import { RevisionHistory } from './revision-history';

function SeoFields({
  draft,
  set,
}: Readonly<{ draft: CmsPage; set: (patch: Partial<CmsPage>) => void }>) {
  const patchSeo = (change: Partial<CmsPage['seo']>): void =>
    set({ seo: { ...draft.seo, ...change } });

  return (
    <div className="flex flex-col gap-4">
      <FormField
        label="Address"
        required
        hint="The path this page is served at, without a leading slash."
      >
        <Input value={draft.slug} onChange={(event) => set({ slug: event.target.value })} />
      </FormField>
      <FormField label="Search title" hint="What a search engine shows as the headline.">
        <Input
          value={draft.seo.title}
          onChange={(event) => patchSeo({ title: event.target.value })}
        />
      </FormField>
      <FormField label="Search description" hint="The sentence beneath the headline in results.">
        <Textarea
          rows={2}
          value={draft.seo.description}
          onChange={(event) => patchSeo({ description: event.target.value })}
        />
      </FormField>
      <Switch
        checked={draft.seo.noIndex}
        onChange={(event) => patchSeo({ noIndex: event.target.checked })}
        description="Keeps the page out of search results. Use for pages linked to only from an email."
      >
        Hide from search engines
      </Switch>
    </div>
  );
}

export interface PageEditorProps {
  readonly page: CmsPage | null;
  readonly onClose: () => void;
}

/** Publishing state and the draft save, which are separate actions on purpose. */
function EditorFooter({
  draft,
  saving,
  onSave,
}: {
  readonly draft: CmsPage;
  readonly saving: boolean;
  readonly onSave: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3">
      <PublishControls page={draft} />
      <Button variant="secondary" loading={saving} onClick={onSave}>
        Save the draft
      </Button>
    </div>
  );
}

/** The four faces of a page: what it says, how it is found, how it looks, what it was. */
function EditorTabs({
  draft,
  set,
}: {
  readonly draft: CmsPage;
  readonly set: (patch: Partial<CmsPage>) => void;
}) {
  return (
    <Tabs defaultValue="content">
      <TabList label="Page editor">
        <Tab value="content">Content</Tab>
        <Tab value="seo">Search</Tab>
        <Tab value="preview">Preview</Tab>
        <Tab value="history">History</Tab>
      </TabList>

      <TabPanel value="content">
        <div className="flex flex-col gap-4">
          <FormField label="Title" required>
            <Input value={draft.title} onChange={(event) => set({ title: event.target.value })} />
          </FormField>
          <BlockEditor blocks={draft.blocks} onChange={(blocks) => set({ blocks: [...blocks] })} />
        </div>
      </TabPanel>
      <TabPanel value="seo">
        <SeoFields draft={draft} set={set} />
      </TabPanel>
      <TabPanel value="preview">
        <PagePreview page={draft} />
      </TabPanel>
      <TabPanel value="history">
        <RevisionHistory page={draft} />
      </TabPanel>
    </Tabs>
  );
}

/** Edits one CMS page and moves it through review to publication. */
export function PageEditor({ page, onClose }: PageEditorProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CmsPage | null>(page);
  const [editing, setEditing] = useState<CmsPage | null>(page);

  // Opening a different page discards the draft, adjusted during render rather than in an
  // effect. An effect would commit the old page's draft to the screen first and then
  // immediately re-render with the new one — a visible flash of the wrong page's content,
  // and the cascading render React warns about. Setting state during render is the
  // documented way to reset state when a prop changes; React discards the in-progress
  // render and restarts before anything is committed.
  if (page !== editing) {
    setEditing(page);
    setDraft(page);
  }

  const save = useMutation({
    mutationFn: async (next: CmsPage) => client.admin.updateCmsPage(next.id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.all('content') }),
  });

  const set = (patch: Partial<CmsPage>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <DetailDrawer
      open={page !== null}
      onClose={onClose}
      title={page?.title ?? 'Page'}
      recordId={page?.id}
      footer={
        draft && (
          <EditorFooter draft={draft} saving={save.isPending} onSave={() => save.mutate(draft)} />
        )
      }
    >
      {save.error && <Alert tone="danger">{messageFor(save.error)}</Alert>}
      {draft && <EditorTabs draft={draft} set={set} />}
    </DetailDrawer>
  );
}
