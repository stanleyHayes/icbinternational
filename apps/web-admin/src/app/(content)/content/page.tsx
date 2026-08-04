/**
 * `/content` — the content studio.
 */

import type { Metadata } from 'next';

import { ContentScreen } from './content-screen';

export const metadata: Metadata = {
  title: 'Content',
  description: 'Pages, articles, help-centre answers and branch details.',
};

/** The content studio. */
export default function ContentPage() {
  return <ContentScreen />;
}
