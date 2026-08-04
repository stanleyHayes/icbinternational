/**
 * The block editor.
 *
 * A page is an ordered list of typed blocks, and order is most of the design: a hero
 * below a rate table is a different page from the same blocks the other way round. So the
 * editor's primary controls are move, add and remove, and they are real buttons rather
 * than a drag handle — dragging is unusable from a keyboard, and this console is used
 * from one.
 *
 * Text properties are editable inline. Anything structured is left alone rather than
 * flattened into a text box, because a half-edited payload is how a live page ends up
 * rendering nothing at all.
 */

'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import type { ContentBlock } from '@reliance/contracts';
import { Button, FormField, Input, Select } from '@reliance/ui';

import { humaniseCode } from '@/lib/format';

/** Block types an editor can add. Mirrors the contract's own list. */
const BLOCK_TYPES: readonly ContentBlock['type'][] = [
  'HERO',
  'FEATURE_GRID',
  'PRODUCT_CARDS',
  'STATS',
  'TESTIMONIALS',
  'FAQ',
  'CTA',
  'RICH_TEXT',
  'IMAGE',
  'COMPARISON_TABLE',
  'RATE_TABLE',
  'CALCULATOR',
  'LOGO_WALL',
  'STEPS',
];

const TYPE_OPTIONS = BLOCK_TYPES.map((value) => ({ value, label: humaniseCode(value) }));

function textEntries(props: Readonly<Record<string, unknown>>): readonly [string, string][] {
  return Object.entries(props).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
}

interface BlockCardProps {
  readonly block: ContentBlock;
  readonly index: number;
  readonly total: number;
  readonly onPatch: (block: ContentBlock) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
}

/**
 * Reorder and remove.
 *
 * Each control is labelled rather than relying on its icon: the three are the same size
 * and shape, and a screen reader announcing "button, button, button" is not a toolbar.
 */
function BlockControls({
  index,
  total,
  onMove,
  onRemove,
}: {
  readonly index: number;
  readonly total: number;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="Move this block up"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="Move this block down"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" iconOnly aria-label="Remove this block" onClick={onRemove}>
        <Trash2 className="size-4" />
      </Button>
    </span>
  );
}

function BlockCard({ block, index, total, onPatch, onMove, onRemove }: BlockCardProps) {
  const texts = textEntries(block.props);

  return (
    <li className="border-border flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-sm font-medium">
          {index + 1}. {humaniseCode(block.type)}
        </span>
        <BlockControls index={index} total={total} onMove={onMove} onRemove={onRemove} />
      </div>

      {texts.length === 0 ? (
        <p className="font-body text-fg-muted text-xs">
          This block takes its content from the platform rather than from typed copy.
        </p>
      ) : (
        texts.map(([key, value]) => (
          <FormField key={key} label={humaniseCode(key)}>
            <Input
              value={value}
              onChange={(event) =>
                onPatch({ ...block, props: { ...block.props, [key]: event.target.value } })
              }
            />
          </FormField>
        ))
      )}
    </li>
  );
}

export interface BlockEditorProps {
  readonly blocks: readonly ContentBlock[];
  readonly onChange: (blocks: readonly ContentBlock[]) => void;
}

/**
 * The list operations, as pure functions of the list.
 *
 * Both return `null` for a request that does not apply — moving the first block up, or
 * adding the placeholder option — so the component has one shape of check to make and no
 * list-index reasoning of its own.
 */
function moved(
  blocks: readonly ContentBlock[],
  index: number,
  direction: -1 | 1,
): ContentBlock[] | null {
  const target = index + direction;
  if (target < 0 || target >= blocks.length) return null;

  const next = [...blocks];
  const subject = next[index];
  const displaced = next[target];
  if (!subject || !displaced) return null;

  next[index] = displaced;
  next[target] = subject;
  return next;
}

function added(blocks: readonly ContentBlock[], type: string): ContentBlock[] | null {
  if (type === '') return null;

  return [
    ...blocks,
    {
      id: `blk_${String(blocks.length + 1)}`,
      type: type as ContentBlock['type'],
      props: { heading: '' },
    },
  ];
}

/** Reorders, edits, adds and removes the blocks that make up a page. */
export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const apply = (next: ContentBlock[] | null): void => {
    if (next) onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            onPatch={(next) => onChange(blocks.map((item) => (item.id === block.id ? next : item)))}
            onMove={(direction) => apply(moved(blocks, index, direction))}
            onRemove={() => onChange(blocks.filter((item) => item.id !== block.id))}
          />
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Select
          selectSize="sm"
          aria-label="Block to add"
          value=""
          placeholder="Add a block"
          options={TYPE_OPTIONS}
          onChange={(event) => apply(added(blocks, event.target.value))}
        />
        <Plus aria-hidden="true" className="text-fg-subtle size-4" />
      </div>
    </div>
  );
}
