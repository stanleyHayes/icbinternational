import { Info } from 'lucide-react';

import { cn } from '@reliance/ui';

import type { Prose, ProseBlock } from '@/content/prose';

const ICON_SIZE = 18;

/** Blocks are authored content, so their own text is a stable and unique identity. */
function blockKey(block: ProseBlock): string {
  if (block.kind === 'list' || block.kind === 'steps') return block.items.join('|');
  if (block.kind === 'callout') return block.title;
  return block.text;
}

function Callout({ title, text }: { readonly title: string; readonly text: string }) {
  return (
    <aside className="border-border bg-surface-sunken rounded-lg border p-5">
      <p className="text-fg flex items-center gap-2 font-medium">
        <Info size={ICON_SIZE} aria-hidden className="text-accent shrink-0" />
        {title}
      </p>
      <p className="text-fg-muted mt-2 text-base leading-relaxed">{text}</p>
    </aside>
  );
}

function ItemList({
  items,
  ordered,
}: {
  readonly items: readonly string[];
  readonly ordered: boolean;
}) {
  const children = items.map((item) => <li key={item}>{item}</li>);

  return ordered ? (
    <ol className="list-decimal space-y-2 pl-5">{children}</ol>
  ) : (
    <ul>{children}</ul>
  );
}

function Block({ block }: { readonly block: ProseBlock }) {
  switch (block.kind) {
    case 'heading': {
      return <h2>{block.text}</h2>;
    }
    case 'subheading': {
      return <h3>{block.text}</h3>;
    }
    case 'list': {
      return <ItemList items={block.items} ordered={false} />;
    }
    case 'steps': {
      return <ItemList items={block.items} ordered />;
    }
    case 'callout': {
      return <Callout title={block.title} text={block.text} />;
    }
    default: {
      return <p>{block.text}</p>;
    }
  }
}

/** Renders a document written as {@link Prose}. */
export function ProseBlocks({
  blocks,
  className,
}: {
  readonly blocks: Prose;
  readonly className?: string;
}) {
  return (
    <div className={cn('rb-prose', className)}>
      {blocks.map((block) => (
        <Block key={blockKey(block)} block={block} />
      ))}
    </div>
  );
}
