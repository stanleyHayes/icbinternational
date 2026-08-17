'use client';

/**
 * The chat panel: header, body and the connection small print.
 *
 * The body is one of three things — the thread, a spinner while the thread loads, or the
 * start-a-chat form. The form shows when the customer asks for a new conversation, and
 * when there is no conversation to show at all.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { RefObject } from 'react';

import type { ChatConversation } from '@reliance/contracts';
import { Button, Spinner } from '@reliance/ui';

import type { ChatStreamState } from '@/lib/use-chat-stream';

import { FormAlert } from './form-alert';
import { NewConversationForm } from './support-chat-new-conversation';
import { ThreadView } from './support-chat-thread';

/** "Connecting…" / "Offline — retrying"; nothing while the stream is up. */
function ConnectionNote({ state }: { readonly state: ChatStreamState }) {
  if (state === 'live') return null;
  return (
    <p role="status" className="text-fg-subtle text-xs">
      {state === 'connecting' ? 'Connecting…' : 'Offline — retrying'}
    </p>
  );
}

/** Props for {@link PanelHeader}. */
interface PanelHeaderProps {
  readonly title: string;
  readonly streamState: ChatStreamState;
  readonly showNewButton: boolean;
  readonly onNew: () => void;
  readonly onClose: () => void;
}

function PanelHeader({ title, streamState, showNewButton, onNew, onClose }: PanelHeaderProps) {
  return (
    <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="min-w-0">
        <p className="text-fg truncate text-sm font-semibold">{title}</p>
        <ConnectionNote state={streamState} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {showNewButton ? (
          <Button variant="ghost" size="sm" onClick={onNew}>
            New
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" iconOnly aria-label="Close chat" onClick={onClose}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Props for {@link PanelBody}. */
interface PanelBodyProps {
  readonly latest: ChatConversation | null;
  readonly detail: UseQueryResult<ChatConversation>;
  readonly composing: boolean;
  readonly onStartNew: () => void;
  readonly onBack: () => void;
  readonly onCreated: () => void;
}

/** Thread, spinner, or the start-a-chat form. */
function PanelBody({ latest, detail, composing, onStartNew, onBack, onCreated }: PanelBodyProps) {
  if (composing || latest === null) {
    return <NewConversationForm onCancel={latest === null ? null : onBack} onCreated={onCreated} />;
  }
  if (detail.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Spinner label="Loading conversation" />
      </div>
    );
  }
  if (detail.data) return <ThreadView conversation={detail.data} onStartNew={onStartNew} />;
  return (
    <div className="p-4">
      <FormAlert error={detail.error} />
    </div>
  );
}

/** Props for {@link ChatPanel}. */
export interface ChatPanelProps {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly latest: ChatConversation | null;
  readonly detail: UseQueryResult<ChatConversation>;
  readonly composing: boolean;
  readonly streamState: ChatStreamState;
  readonly onStartNew: () => void;
  readonly onBack: () => void;
  readonly onCreated: () => void;
  readonly onClose: () => void;
}

/** The floating panel the chat lives in — about a phone screen wide, viewport-aware tall. */
export function ChatPanel(props: ChatPanelProps) {
  const { ref, latest, detail, composing, streamState, onStartNew, onBack, onCreated, onClose } =
    props;
  const title = latest === null || composing ? 'New conversation' : latest.subject;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Support chat"
      className="border-border bg-surface-raised flex max-h-[min(36rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg sm:w-96"
    >
      <PanelHeader
        title={title}
        streamState={streamState}
        showNewButton={latest !== null && !composing}
        onNew={onStartNew}
        onClose={onClose}
      />
      <PanelBody
        latest={latest}
        detail={detail}
        composing={composing}
        onStartNew={onStartNew}
        onBack={onBack}
        onCreated={onCreated}
      />
    </div>
  );
}
