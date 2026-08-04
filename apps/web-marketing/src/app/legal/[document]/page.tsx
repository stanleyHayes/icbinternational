import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/marketing/page-header';
import { ProseBlocks } from '@/components/marketing/prose-blocks';
import { Section } from '@/components/marketing/section';
import { isLegalSlug, LEGAL_DOCUMENTS, LEGAL_SLUGS } from '@/content/legal';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo/metadata';

interface LegalPageProps {
  readonly params: Promise<{ readonly document: string }>;
}

/** The three legal documents are known at build time, so all three are prerendered. */
export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ document: slug }));
}

export async function generateMetadata({ params }: LegalPageProps) {
  const { document } = await params;
  if (!isLegalSlug(document))
    return pageMetadata({ title: 'Legal', description: '', path: '/legal/terms' });

  const entry = LEGAL_DOCUMENTS[document];
  return pageMetadata({
    title: entry.title,
    description: entry.description,
    path: `/legal/${document}`,
  });
}

/** A legal document. */
export default async function LegalDocumentPage({ params }: LegalPageProps) {
  const { document } = await params;
  if (!isLegalSlug(document)) notFound();

  const entry = LEGAL_DOCUMENTS[document];

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title={entry.title}
        description={entry.description}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      >
        <p className="text-fg-subtle text-sm">Last updated {formatDate(entry.updatedOn)}.</p>
      </PageHeader>

      <Section>
        <ProseBlocks blocks={entry.body} />
      </Section>
    </>
  );
}
