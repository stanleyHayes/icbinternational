'use client';

/**
 * The frame every chart on Insights sits in.
 *
 * A chart is a picture of numbers. Recharts renders it as a tree of `<path>` elements that a
 * screen reader can say nothing useful about, so the picture is marked `aria-hidden` and the
 * numbers are published beside it as a real table — the *same* numbers, from the same array, so
 * the two cannot drift.
 *
 * The table is rendered `sr-only` by default rather than hidden behind a `<details>`. Collapsed
 * `<details>` content is removed from the accessibility tree as well as from the screen, which
 * would have hidden the accessible version of the chart from precisely the people it is for.
 * A button reveals it visually for everybody else, because "what exactly is that slice" is a
 * question sighted customers ask too.
 */

import { Table as TableIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Button, Card, CardHeader, cn, Skeleton } from '@reliance/ui';

/** Props for {@link ChartFrame}. */
export interface ChartFrameProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Trailing control on the header — a period switcher, a link into the transaction list. */
  readonly action?: ReactNode;
  /** The chart. Rendered inside an `aria-hidden` wrapper of a fixed height. */
  readonly chart: ReactNode;
  /** The same figures as a `<table>`, with a `<caption>`. Always present for screen readers. */
  readonly table: ReactNode;
  /** Height reserved for the chart, so nothing below it moves when the data lands. */
  readonly height?: number;
  readonly loading?: boolean;
  /** Shown in place of the chart when there is nothing to draw. */
  readonly empty?: ReactNode;
  readonly className?: string;
}

/** Default plot height. Tall enough for a twelve-bar series to be readable on a phone. */
const DEFAULT_HEIGHT = 260;

/** The plot itself, or the space reserved for it. */
function Plot({
  height,
  loading,
  empty,
  chart,
}: Pick<ChartFrameProps, 'height' | 'loading' | 'empty' | 'chart'> & { readonly height: number }) {
  const box = { height: `${height}px` };

  return (
    <div className="mt-4" style={{ minHeight: box.height }}>
      {loading ? <Skeleton shape="block" style={box} className="w-full" /> : null}
      {!loading && empty ? empty : null}
      {!loading && !empty ? (
        <div aria-hidden="true" style={box}>
          {chart}
        </div>
      ) : null}
    </div>
  );
}

/** The figures, and the control that reveals them visually. */
function Figures({ table }: { readonly table: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const tableId = useId();

  return (
    <>
      <div className="mt-3 flex justify-end print:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={visible}
          aria-controls={tableId}
          onClick={() => setVisible((shown) => !shown)}
          startIcon={<TableIcon aria-hidden="true" className="size-4" />}
        >
          {visible ? 'Hide the figures' : 'Show the figures'}
        </Button>
      </div>
      <div id={tableId} className={cn('mt-2', !visible && 'sr-only')}>
        {table}
      </div>
    </>
  );
}

/**
 * @example
 * <ChartFrame title="Where your money went" chart={<SpendDonut … />} table={<CategoryTable … />} />
 */
export function ChartFrame(props: ChartFrameProps) {
  const { title, description, action, chart, table, loading, empty, className } = props;
  const height = props.height ?? DEFAULT_HEIGHT;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} description={description} action={action} />
      <Plot height={height} loading={loading} empty={empty} chart={chart} />
      {loading || empty ? null : <Figures table={table} />}
    </Card>
  );
}
