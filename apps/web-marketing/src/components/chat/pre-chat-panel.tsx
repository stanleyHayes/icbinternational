'use client';

/**
 * The pre-chat form: who the guest is, and the question that opens the thread.
 *
 * The values live in one `GuestChatInput` state object so the fields component takes a
 * single `onChange` rather than three setters — the form is one value, not three.
 */

import { useState, type FormEvent } from 'react';

import { Button, FormField, Input, Textarea } from '@reliance/ui';

import type { GuestChatInput } from '@/lib/chat/use-guest-chat';

interface PreChatFieldsProps {
  readonly values: GuestChatInput;
  readonly onChange: (field: keyof GuestChatInput, value: string) => void;
}

function PreChatFields({ values, onChange }: PreChatFieldsProps) {
  return (
    <>
      <FormField label="Your name" required>
        <Input
          value={values.name}
          onChange={(event) => onChange('name', event.target.value)}
          autoComplete="name"
          required
        />
      </FormField>

      <FormField label="Email address" required>
        <Input
          type="email"
          value={values.email}
          onChange={(event) => onChange('email', event.target.value)}
          autoComplete="email"
          required
        />
      </FormField>

      <FormField label="How can we help?" required>
        <Textarea
          value={values.body}
          onChange={(event) => onChange('body', event.target.value)}
          rows={4}
          required
        />
      </FormField>
    </>
  );
}

const EMPTY: GuestChatInput = { name: '', email: '', body: '' };

export function PreChatPanel({
  starting,
  onStart,
}: {
  readonly starting: boolean;
  readonly onStart: (input: GuestChatInput) => Promise<boolean>;
}) {
  const [values, setValues] = useState<GuestChatInput>(EMPTY);

  const change = (field: keyof GuestChatInput, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onStart({
      name: values.name.trim(),
      email: values.email.trim(),
      body: values.body.trim(),
    });
  };

  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={submit}>
      <p className="text-fg-muted text-sm leading-relaxed">
        Ask about accounts, savings or borrowing — a member of the team replies right here,
        usually within a few minutes.
      </p>
      <PreChatFields values={values} onChange={change} />
      <Button type="submit" variant="primary" loading={starting} fullWidth>
        Start chat
      </Button>
    </form>
  );
}
