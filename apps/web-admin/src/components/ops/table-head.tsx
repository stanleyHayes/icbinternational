/**
 * The heading row of a plain (non-`DataTable`) table.
 *
 * Seven tables in the console are hand-built rather than driven by `DataTable` — editors,
 * matrices and previews, where the columns are fixed and the cells are inputs rather than
 * text. Each had written the same `<thead><tr><th scope="col">…` by hand, which is a lot
 * of markup to say "these are the columns" and one `scope` attribute away from a table a
 * screen reader cannot navigate.
 *
 * `scope="col"` is not optional and is therefore not a prop: without it, assistive
 * technology has no way to associate a cell with its heading, and a rate table read as a
 * flat list of numbers is useless.
 */

'use client';

/** A column heading. Right-align the ones sitting over numbers. */
export interface TableHeading {
  readonly label: string;
  readonly align?: 'left' | 'right';
  /**
   * Hides the label visually but keeps it for assistive technology. For a column of
   * icon-only controls, which still needs a name.
   */
  readonly visuallyHidden?: boolean;
}

export interface TableHeadProps {
  readonly headings: readonly (string | TableHeading)[];
  /** The `th` class the surrounding table uses. */
  readonly className: string;
}

export function TableHead({ headings, className }: TableHeadProps) {
  return (
    <thead>
      <tr className="border-border bg-surface-sunken border-b">
        {headings.map((heading) => {
          const { label, align, visuallyHidden } =
            typeof heading === 'string'
              ? { label: heading, align: 'left' as const, visuallyHidden: false }
              : heading;

          return (
            <th
              key={label}
              scope="col"
              className={align === 'right' ? `${className} text-right` : className}
            >
              {visuallyHidden ? <span className="sr-only">{label}</span> : label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
