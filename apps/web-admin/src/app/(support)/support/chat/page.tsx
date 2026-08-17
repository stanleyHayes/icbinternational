/**
 * `/support/chat` — the live-chat inbox.
 */

import type { Metadata } from 'next';

import { ChatInbox } from './chat-inbox';

export const metadata: Metadata = {
  title: 'Live chat',
};

/** Real-time conversations, next to the ticket queue but faster. */
export default function ChatPage() {
  return <ChatInbox />;
}
