'use client';

/**
 * Starting a conversation.
 *
 * The topic is asked for because it routes the message to somebody who can answer it, and that is
 * said rather than left as an unexplained dropdown. Fraud gets its own screen and is signposted
 * from here, since a fraud report freezes cards and cannot wait in a queue.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { TicketTopic, type CreateTicketRequest } from '@reliance/contracts';
import { Alert, Button, FormField, Input, Select, Textarea } from '@reliance/ui';

import { FormAlert, LinkButton } from '@/components/shell';
import { laneRoutes, movementKeys, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { TOPIC_OPTIONS } from './support-look';

const SUBJECT_MAX = 120;
const BODY_MAX = 5000;

/** Opens the ticket and takes the customer straight into the thread. */
function useCreateTicket(
  cache: ReturnType<typeof useQueryClient>,
  onCreated: (ticketId: string) => void,
) {
  return useMutation({
    mutationFn: async (payload: CreateTicketRequest) =>
      (await browserApi().support.createTicket(payload)).data,
    onSuccess: async (ticket) => {
      await cache.invalidateQueries({ queryKey: movementKeys.support.all });
      onCreated(ticket.id);
    },
  });
}

/**
 * @example <NewTicketForm />
 */
export function NewTicketForm() {
  const router = useRouter();
  const cache = useQueryClient();
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState<TicketTopic>(TicketTopic.ACCOUNT);
  const [body, setBody] = useState('');

  const create = useCreateTicket(cache, (id) => router.push(laneRoutes.support.ticket(id)));

  const ready = Boolean(subject.trim() && body.trim());

  const submit = (): void => {
    if (!ready) return;
    create.mutate({
      subject: subject.trim(),
      topic,
      body: body.trim(),
      attachmentIds: [],
    });
  };

  return (
    <Section title="Message us" description="We answer here, and everything stays in one place.">
      <div className="flex flex-col gap-5">
        <FormAlert error={create.error} />
        {topic === TicketTopic.FRAUD ? <FraudSignpost /> : null}

        <TicketFields
          topic={topic}
          subject={subject}
          body={body}
          onTopic={setTopic}
          onSubject={setSubject}
          onBody={setBody}
        />

        <div className="flex justify-end">
          <Button disabled={!ready} loading={create.isPending} onClick={submit}>
            Send this message
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Fraud does not wait in a queue, so it is sent somewhere that acts immediately. */
function FraudSignpost() {
  return (
    <Alert tone="warning" title="If money has gone, do not wait for a reply">
      <p>
        Reporting fraud freezes your cards straight away and puts a case in front of our fraud team
        within minutes. A message sits in a queue.
      </p>
      <p className="mt-3">
        <LinkButton href={laneRoutes.support.fraud} variant="secondary">
          Report fraud now
        </LinkButton>
      </p>
    </Alert>
  );
}

/** Props for {@link TicketFields}. */
interface TicketFieldsProps {
  readonly topic: TicketTopic;
  readonly subject: string;
  readonly body: string;
  readonly onTopic: (value: TicketTopic) => void;
  readonly onSubject: (value: string) => void;
  readonly onBody: (value: string) => void;
}

/** What it is about, what to call it, and what happened. */
function TicketFields(props: TicketFieldsProps) {
  return (
    <>
      <FormField label="What is it about?" required>
        <Select
          options={TOPIC_OPTIONS}
          value={props.topic}
          onChange={(event) => props.onTopic(event.target.value as TicketTopic)}
        />
      </FormField>

      <FormField label="Subject" required>
        <Input
          value={props.subject}
          maxLength={SUBJECT_MAX}
          onChange={(event) => props.onSubject(event.target.value)}
        />
      </FormField>

      <Textarea
        value={props.body}
        maxLength={BODY_MAX}
        showCount
        rows={8}
        aria-label="Your message"
        placeholder="Tell us what has happened. Dates, amounts and names all help."
        onChange={(event) => props.onBody(event.target.value)}
      />
    </>
  );
}
