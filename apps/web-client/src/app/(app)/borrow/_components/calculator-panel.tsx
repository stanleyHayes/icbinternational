'use client';

/**
 * The calculator with its catalogue.
 *
 * The products are fetched here so the calculator itself stays a pure function of what it is
 * given, which is what makes it usable from more than one screen.
 */

import { useQuery } from '@tanstack/react-query';

import { movementKeys, QueryPanel } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { Calculator } from './calculator';

/**
 * @example <CalculatorPanel />
 */
export function CalculatorPanel() {
  const products = useQuery({
    queryKey: movementKeys.borrow.products(),
    queryFn: async () => (await browserApi().borrow.products()).data,
  });

  return (
    <QueryPanel query={products} skeletonRows={2}>
      {(list) => <Calculator products={list} />}
    </QueryPanel>
  );
}
