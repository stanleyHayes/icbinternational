/**
 * The product editor.
 *
 * A draft is held locally until it is published, and publishing supersedes rather than
 * edits — the platform assigns the next version and dates the old one out. The editor
 * therefore never mutates what is on screen: the operator is always looking at the live
 * version on one side and their draft on the other, and the impact preview is the bridge
 * between them.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Product } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
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

import { FeeScheduleEditor } from './fee-schedule-editor';
import { ImpactPreview } from './impact-preview';
import { LimitMatrixEditor } from './limit-matrix-editor';
import { RateTiersEditor } from './rate-tiers-editor';

function SummaryFields({
  draft,
  set,
}: Readonly<{ draft: Product; set: (patch: Partial<Product>) => void }>) {
  return (
    <div className="flex flex-col gap-4">
      <FormField label="Name" required hint="What customers see in the app and on the website.">
        <Input value={draft.name} onChange={(event) => set({ name: event.target.value })} />
      </FormField>
      <FormField label="Tagline" hint="One line, used on product cards and comparison tables.">
        <Input value={draft.tagline} onChange={(event) => set({ tagline: event.target.value })} />
      </FormField>
      <FormField
        label="Description"
        hint="The full proposition, as it appears on the product page."
      >
        <Textarea
          rows={3}
          value={draft.description}
          onChange={(event) => set({ description: event.target.value })}
        />
      </FormField>
      <FormField
        label="Effective from"
        required
        hint="Accounts opened on or after this date get these terms. Earlier accounts keep theirs."
      >
        <Input
          type="date"
          value={draft.effectiveFrom}
          onChange={(event) => set({ effectiveFrom: event.target.value })}
        />
      </FormField>
      <Switch checked={draft.active} onChange={(event) => set({ active: event.target.checked })}>
        Open to new customers
      </Switch>
    </div>
  );
}

export interface ProductEditorProps {
  readonly product: Product | null;
  readonly onClose: () => void;
}

/** Edits a product and supersedes it with a new version. */
/**
 * The draft being edited, reset whenever a different product is opened.
 *
 * The reset is done during render rather than in an effect: an effect commits the previous
 * product's draft to the screen first and re-renders immediately after, which both flashes
 * the wrong product's rates and is the cascading render React warns about.
 */
function useProductDraft(product: Product | null) {
  const [draft, setDraft] = useState<Product | null>(product);
  const [editing, setEditing] = useState<Product | null>(product);

  if (product !== editing) {
    setEditing(product);
    setDraft(product);
  }

  const set = (patch: Partial<Product>): void => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  return { draft, set };
}

/** Publishing supersedes the version rather than editing it. The footer says so. */
function PublishFooter({
  draft,
  pending,
  onPublish,
}: {
  readonly draft: Product;
  readonly pending: boolean;
  readonly onPublish: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="font-body text-fg-muted text-xs">
        Publishing creates version {draft.version + 1}. Nothing changes for existing accounts.
      </span>
      <Button loading={pending} onClick={onPublish}>
        Publish this version
      </Button>
    </div>
  );
}

/** The tabs, in order. Paired with their panels below rather than repeated as markup. */
const TAB_LABELS = [
  ['summary', 'Summary'],
  ['fees', 'Fees'],
  ['rates', 'Rates'],
  ['limits', 'Limits'],
  ['impact', 'Impact'],
] as const;

/** Fees, rates and limits: the three tabs that price the product. */
function PricingPanels({
  draft,
  set,
  currency,
}: {
  readonly draft: Product;
  readonly set: (patch: Partial<Product>) => void;
  readonly currency: CurrencyCode;
}) {
  return (
    <>
      <TabPanel value="fees">
        <FeeScheduleEditor
          fees={draft.fees}
          currency={currency}
          onChange={(fees) => set({ fees: [...fees] })}
        />
      </TabPanel>
      <TabPanel value="rates">
        <RateTiersEditor
          tiers={draft.creditInterestTiers}
          currency={currency}
          onChange={(tiers) => set({ creditInterestTiers: [...tiers] })}
        />
      </TabPanel>
      <TabPanel value="limits">
        <LimitMatrixEditor
          limits={draft.limits}
          currency={currency}
          onChange={(limits) => set({ limits })}
        />
      </TabPanel>
    </>
  );
}

/** The five faces of a product version. */
function EditorTabs({
  product,
  draft,
  set,
  currency,
}: {
  readonly product: Product;
  readonly draft: Product;
  readonly set: (patch: Partial<Product>) => void;
  readonly currency: CurrencyCode;
}) {
  return (
    <Tabs defaultValue="summary">
      <TabList label="Product editor">
        {TAB_LABELS.map(([value, label]) => (
          <Tab key={value} value={value}>
            {label}
          </Tab>
        ))}
      </TabList>

      <TabPanel value="summary">
        <SummaryFields draft={draft} set={set} />
      </TabPanel>
      <PricingPanels draft={draft} set={set} currency={currency} />
      <TabPanel value="impact">
        <ImpactPreview live={product} draft={draft} />
      </TabPanel>
    </Tabs>
  );
}

export function ProductEditor({ product, onClose }: ProductEditorProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { draft, set } = useProductDraft(product);

  const publish = useMutation({
    mutationFn: async (next: Product) => client.admin.updateProduct(next.code, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('products') });
      onClose();
    },
  });

  const currency = (draft?.currencies[0] ?? 'GBP') as CurrencyCode;

  return (
    <DetailDrawer
      open={product !== null}
      onClose={onClose}
      title={product ? `${product.name} · version ${product.version}` : 'Product'}
      recordId={product?.code}
      footer={
        draft && (
          <PublishFooter
            draft={draft}
            pending={publish.isPending}
            onPublish={() => publish.mutate(draft)}
          />
        )
      }
    >
      {publish.error && <Alert tone="danger">{messageFor(publish.error)}</Alert>}

      {product && draft && (
        <EditorTabs product={product} draft={draft} set={set} currency={currency} />
      )}
    </DetailDrawer>
  );
}
