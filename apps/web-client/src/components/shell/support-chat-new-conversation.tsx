'use client';

/**
 * Starting a conversation.
 *
 * Two fields — a subject and the first message — because that is all the API opens a
 * conversation with, and all support needs to route it. Shown when the customer has no
 * conversation yet, and behind the "New conversation" affordance when they do.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { Button, FormField, Input, Textarea } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { FormAlert } from './form-alert';

const BODY_MAX = 2000;
const SUBJECT_MAX = 120;

/** Opens the conversation and lands it in the cache, so the thread shows at once. */
function useCreateConversation(onCreated: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { subject: string; body: string }) =>
      (await browserApi().chat.createConversation(input)).data,
    onSuccess: (conversation) => {
      queryClient.setQueryData(queryKeys.chat.conversation(conversation.id), conversation);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() });
      onCreated();
    },
  });
}

/** Props for {@link NewConversationForm}. */
export interface NewConversationFormProps {
  /** Offered only when there is an existing conversation to go back to. */
  readonly onCancel: (() => void) | null;
  readonly onCreated: () => void;
}

/** Props for {@link FormFooter}. */
interface FormFooterProps {
  readonly onCancel: (() => void) | null;
  readonly ready: boolean;
  readonly pending: boolean;
}

/** Back (when there is a thread to return to) and Start chat. */
function FormFooter({ onCancel, ready, pending }: FormFooterProps) {
  return (
    <div className="mt-auto flex justify-end gap-2">
      {onCancel ? (
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Back
        </Button>
      ) : null}
      <Button type="submit" size="sm" disabled={!ready} loading={pending}>
        Start chat
      </Button>
    </div>
  );
}

/** The start-a-chat form: subject plus first message. */
export function NewConversationForm({ onCancel, onCreated }: NewConversationFormProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const create = useCreateConversation(onCreated);
  const ready = subject.trim() !== '' && body.trim() !== '';

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready || create.isPending) return;
    create.mutate({ subject: subject.trim(), body: body.trim() });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <FormAlert error={create.error} />
      <FormField label="Subject" required>
        <Input
          value={subject}
          maxLength={SUBJECT_MAX}
          placeholder="What is this about?"
          onChange={(event) => setSubject(event.target.value)}
        />
      </FormField>
      <FormField label="Message" required>
        <Textarea
          value={body}
          maxLength={BODY_MAX}
          placeholder="Tell us what you need help with"
          onChange={(event) => setBody(event.target.value)}
        />
      </FormField>
      <FormFooter onCancel={onCancel} ready={ready} pending={create.isPending} />
    </form>
  );
}
