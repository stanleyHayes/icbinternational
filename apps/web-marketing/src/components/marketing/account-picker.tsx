'use client';

import { useState } from 'react';

import type { Product } from '@reliance/contracts';

import { AccountOption } from './account-option';
import { ExternalLinkButton } from './link-button';

function ContinueBlock({ href, name }: { readonly href: string; readonly name?: string }) {
  return (
    <div aria-live="polite" className="mt-8">
      <ExternalLinkButton href={href} variant="primary" size="lg">
        Continue with the {name ?? 'selected account'}
      </ExternalLinkButton>
      <p className="text-fg-muted mt-3 text-sm">
        You will be taken to our secure application. Nothing is submitted until you have reviewed
        every answer.
      </p>
    </div>
  );
}

/**
 * The handoff to the application.
 *
 * The customer chooses the account here, on a page that is static and fast, and only then
 * crosses to the authenticated app — carrying the product code so the application opens on
 * the right form rather than asking the same question again. Nothing personal is collected
 * on this domain.
 */
export function AccountPicker({
  products,
  applyBaseUrl,
}: {
  readonly products: readonly Product[];
  readonly applyBaseUrl: string;
}) {
  const [selected, setSelected] = useState(products[0]?.code ?? '');
  const chosen = products.find((product) => product.code === selected);

  return (
    <div>
      <fieldset className="border-0 p-0">
        <legend className="font-display text-fg text-xl font-semibold">
          Which account are you opening?
        </legend>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <AccountOption
              key={product.code}
              product={product}
              selected={product.code === selected}
              onSelect={setSelected}
            />
          ))}
        </ul>
      </fieldset>

      <ContinueBlock
        href={`${applyBaseUrl}?product=${encodeURIComponent(selected)}`}
        name={chosen?.name}
      />
    </div>
  );
}
