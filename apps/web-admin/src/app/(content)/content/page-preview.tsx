/**
 * The page as it will read.
 *
 * Not a pixel-accurate rendering — the website owns that, and a second renderer here would
 * drift from it and quietly lie. What an editor needs before publishing is the sequence
 * and the words: which blocks appear in what order, and every piece of copy that will be
 * on the page, so a heading left empty or a paragraph left half-written is visible before
 * a customer finds it.
 */

'use client';

import type { CmsPage, ContentBlock } from '@reliance/contracts';
import { Alert, Badge } from '@reliance/ui';

import { humaniseCode } from '@/lib/format';

/** Copy on a block, in the order the properties were written. */
function copyOf(block: ContentBlock): readonly [string, string][] {
  return Object.entries(block.props).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );
}

function BlockPreview({ block, position }: Readonly<{ block: ContentBlock; position: number }>) {
  const copy = copyOf(block);

  return (
    <li className="border-border flex flex-col gap-1.5 rounded-md border p-3">
      <span className="flex items-center gap-2">
        <Badge tone="neutral">{position}</Badge>
        <span className="font-body text-fg-subtle text-xs font-medium tracking-wider uppercase">
          {humaniseCode(block.type)}
        </span>
      </span>
      {copy.length === 0 ? (
        <p className="font-body text-fg-muted text-sm">
          No copy on this block. It draws its content from the platform when the page is served.
        </p>
      ) : (
        <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1">
          {copy.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-body text-fg-muted text-xs">{humaniseCode(key)}</dt>
              <dd className="font-body text-fg text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export interface PagePreviewProps {
  readonly page: CmsPage;
}

/** The page's blocks and copy, in order. */
export function PagePreview({ page }: PagePreviewProps) {
  const empty = page.blocks.filter((block) => copyOf(block).length === 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-surface-sunken flex flex-col gap-1 rounded-md border p-3">
        <span className="font-display text-fg text-base font-semibold">{page.title}</span>
        <span className="text-fg-muted font-mono text-xs">/{page.slug}</span>
        <span className="font-body text-fg-muted text-sm">{page.seo.description}</span>
      </div>

      {empty > 0 && (
        <Alert tone="warning">
          {empty} {empty === 1 ? 'block has' : 'blocks have'} no copy on them. Check that is
          intended before this goes live.
        </Alert>
      )}

      <ol className="flex flex-col gap-2">
        {page.blocks.map((block, index) => (
          <BlockPreview key={block.id} block={block} position={index + 1} />
        ))}
      </ol>
    </div>
  );
}
