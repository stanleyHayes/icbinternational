/**
 * Structured data.
 *
 * Search engines read this to decide what a bank's phone number, opening hours and
 * answers are. It has to agree with the page — a `FAQPage` graph listing questions the
 * page does not show is a manual-action risk, not a ranking trick.
 */

import { BANK, SITE_URL } from '@/content/site';

/** A JSON-LD graph node. Values are whatever schema.org allows in that position. */
export type JsonLdValue = string | number | boolean | null | JsonLdNode | readonly JsonLdValue[];

/** A JSON-LD object. */
export interface JsonLdNode {
  readonly [key: string]: JsonLdValue | undefined;
}

const SCHEMA_CONTEXT = 'https://schema.org';

/** The bank itself. Emitted once, from the root layout. */
export function organisationJsonLd(): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BankOrCreditUnion',
    '@id': `${SITE_URL}/#organisation`,
    name: BANK.shortName,
    legalName: BANK.legalName,
    url: SITE_URL,
    description: BANK.description,
    foundingDate: String(BANK.foundedYear),
    slogan: BANK.tagline,
    telephone: BANK.phone,
    email: BANK.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BANK.registeredOffice.street,
      addressLocality: BANK.registeredOffice.locality,
      postalCode: BANK.registeredOffice.postalCode,
      addressCountry: BANK.registeredOffice.country,
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: BANK.phone,
        availableLanguage: ['English'],
        areaServed: 'GB',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'emergency',
        name: 'Lost or stolen card',
        telephone: BANK.lostCardPhone,
        areaServed: 'GB',
      },
    ],
  };
}

/** The site, so a search engine can offer a search box against it. */
export function websiteJsonLd(): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: BANK.shortName,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organisation` },
  };
}

/** One question and its answer, for the help centre. */
export interface JsonLdQuestion {
  readonly question: string;
  readonly answer: string;
}

/** The FAQ graph. Only ever built from questions the page actually renders. */
export function faqJsonLd(questions: readonly JsonLdQuestion[]): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'FAQPage',
    mainEntity: questions.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/** An editorial article. */
export function articleJsonLd(input: {
  readonly headline: string;
  readonly description: string;
  readonly path: string;
  readonly publishedAt: string;
  readonly authorName: string;
}): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    datePublished: input.publishedAt,
    mainEntityOfPage: `${SITE_URL}${input.path}`,
    author: { '@type': 'Person', name: input.authorName },
    publisher: { '@id': `${SITE_URL}/#organisation` },
  };
}

/** A breadcrumb trail, so a search result shows the section rather than a bare URL. */
export function breadcrumbJsonLd(
  trail: readonly { readonly name: string; readonly path: string }[],
): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}
