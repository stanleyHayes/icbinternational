/**
 * A bank letter, laid out the way a letter is read.
 *
 * Recipient, then what the bank is confirming, then the account it is confirming it
 * about, then who issued it and when. The account block sits *below* the statement of
 * fact rather than above it, because the person reading a proof of balance is reading one
 * sentence and everything else is supporting detail.
 */

import { type LetterKind } from '@reliance/contracts';

import {
  accountFacts,
  letterBody,
  letterClosing,
  letterTitle,
  salutation,
  type LetterFacts,
} from '../letter-copy.js';

import { PdfPage } from './pdf-canvas.js';

export function renderLetterPdf(kind: LetterKind, facts: LetterFacts): Promise<Buffer> {
  const page = new PdfPage({
    title: `${letterTitle(kind)} — ${facts.account.number}`,
    author: facts.bank,
  }).letterhead({ bank: facts.bank, title: letterTitle(kind), subtitle: facts.asOfDay });

  page.paragraph(salutation(facts.addressedTo));
  for (const body of letterBody(kind, facts)) page.paragraph(body);

  return page
    .heading('Account')
    .keyValues(accountFacts(facts.account))
    .footnote(letterClosing(facts))
    .render();
}
