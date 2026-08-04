/**
 * What publishing this version would do.
 *
 * Two things an operator needs before they commit: the list of fields that actually
 * change, and a plain statement of who it reaches. Repricing never edits a live product —
 * it supersedes it — so an account opened last year keeps the terms it was sold, and the
 * preview says so rather than leaving the operator to hope.
 */

'use client';

import type { Product } from '@reliance/contracts';
import { Alert, EmptyState } from '@reliance/ui';

import { TableHead } from '@/components/ops';
import { formatDate } from '@/lib/format';

import { productChanges, type ProductChange } from './product-diff';

const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';
const CELL = 'px-3 py-2 align-top';

function ChangeRow({ change }: Readonly<{ change: ProductChange }>) {
  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className={`${CELL} text-left font-normal`}>
        {change.label}
      </th>
      <td className={`${CELL} text-fg-muted line-through`}>{change.before}</td>
      <td className={`${CELL} font-medium`}>{change.after}</td>
    </tr>
  );
}

export interface ImpactPreviewProps {
  /** The version currently in force. */
  readonly live: Product;
  /** The version that would be published. */
  readonly draft: Product;
}

/** The diff between the live version and the draft, and who it reaches. */
export function ImpactPreview({ live, draft }: ImpactPreviewProps) {
  const changes = productChanges(live, draft);

  if (changes.length === 0) {
    return (
      <EmptyState
        title="Nothing would change"
        description="This draft matches the version currently in force, so publishing it would add a version with identical terms."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert
        tone="warning"
        title={`${changes.length} change${changes.length === 1 ? '' : 's'} would take effect`}
      >
        Publishing creates version {live.version + 1}, in force from{' '}
        {formatDate(draft.effectiveFrom)}. Accounts opened before that date stay on version{' '}
        {live.version} and keep the terms they were sold. Statements produced later still explain a
        fee charged under either version.
      </Alert>

      <div className="border-border overflow-x-auto rounded-md border">
        <table className="font-body w-full border-collapse text-sm">
          <caption className="sr-only">
            Fields that differ between version {live.version} and the draft
          </caption>
          <TableHead className={HEAD} headings={['Field', 'Currently', 'Would become']} />
          <tbody>
            {changes.map((change) => (
              <ChangeRow key={change.label} change={change} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
