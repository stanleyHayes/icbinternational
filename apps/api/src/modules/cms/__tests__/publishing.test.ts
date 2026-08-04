/**
 * The publishing workflow, preview tokens and revision history.
 *
 * The transitions are pure, so they are asserted directly rather than through a service —
 * "you cannot publish a draft without review" is a property of the state machine, and
 * testing it through three layers of plumbing tests the plumbing.
 */

import { PublishStatus } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { ContentKind } from '../cms.constants.js';
import { ContentService } from '../content.service.js';
import { InMemoryContentStore } from '../in-memory-content.store.js';
import { mintPreviewToken, verifyPreviewToken } from '../publishing/preview-token.js';
import {
  availableActions,
  ContentAction,
  isPubliclyVisible,
  transition,
} from '../publishing/workflow.js';

const SECRET = 'a-preview-signing-secret-of-sufficient-length';

describe('the workflow', () => {
  it('will not publish something that has not been reviewed', () => {
    const result = transition(PublishStatus.DRAFT, ContentAction.PUBLISH);

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.reason).toContain('publish this while it is a draft');
  });

  it('publishes from review', () => {
    expect(transition(PublishStatus.IN_REVIEW, ContentAction.PUBLISH)).toEqual({
      allowed: true,
      next: PublishStatus.PUBLISHED,
    });
  });

  it('will not let scheduling be used as a way around review', () => {
    expect(transition(PublishStatus.DRAFT, ContentAction.SCHEDULE).allowed).toBe(false);
    expect(transition(PublishStatus.IN_REVIEW, ContentAction.SCHEDULE).allowed).toBe(true);
  });

  it('returns something published to draft rather than deleting it', () => {
    expect(transition(PublishStatus.PUBLISHED, ContentAction.UNPUBLISH)).toEqual({
      allowed: true,
      next: PublishStatus.DRAFT,
    });
  });

  it('offers no actions from archived except restoring', () => {
    expect(availableActions(PublishStatus.ARCHIVED)).toEqual([ContentAction.RESTORE]);
  });

  it('treats only PUBLISHED as publicly visible', () => {
    expect(isPubliclyVisible(PublishStatus.PUBLISHED)).toBe(true);
    for (const status of [
      PublishStatus.DRAFT,
      PublishStatus.IN_REVIEW,
      PublishStatus.SCHEDULED,
      PublishStatus.ARCHIVED,
    ]) {
      expect(isPubliclyVisible(status)).toBe(false);
    }
  });
});

describe('preview tokens', () => {
  const issuedAt = new Date('2026-03-14T12:00:00.000Z');

  it('resolves to the document they were minted for', () => {
    const token = mintPreviewToken({ documentId: 'doc_01HABC', secret: SECRET, issuedAt });

    expect(verifyPreviewToken({ token, secret: SECRET, now: issuedAt })).toEqual({
      valid: true,
      documentId: 'doc_01HABC',
    });
  });

  it('refuses a token signed with a different key', () => {
    const token = mintPreviewToken({ documentId: 'doc_01HABC', secret: SECRET, issuedAt });
    const check = verifyPreviewToken({
      token,
      secret: 'a-different-secret-entirely',
      now: issuedAt,
    });

    expect(check.valid).toBe(false);
  });

  it('refuses a token whose payload has been edited to name another document', () => {
    const token = mintPreviewToken({ documentId: 'doc_01HABC', secret: SECRET, issuedAt });
    const [, signature] = token.split('.');
    const forged = `${Buffer.from('doc_01HOTHER:99999999999', 'utf8').toString('base64url')}.${signature}`;

    expect(verifyPreviewToken({ token: forged, secret: SECRET, now: issuedAt }).valid).toBe(false);
  });

  it('expires', () => {
    const token = mintPreviewToken({ documentId: 'doc_01HABC', secret: SECRET, issuedAt });
    const muchLater = new Date(issuedAt.getTime() + 86_400_000);

    const check = verifyPreviewToken({ token, secret: SECRET, now: muchLater });
    expect(check.valid).toBe(false);
    if (check.valid) throw new Error('unreachable');
    expect(check.reason).toContain('expired');
  });

  it('refuses something that is not a token at all', () => {
    expect(verifyPreviewToken({ token: 'nonsense', secret: SECRET, now: issuedAt }).valid).toBe(
      false,
    );
  });
});

describe('revision history', () => {
  function build() {
    const clock = new ClockService();
    const store = new InMemoryContentStore(new IdGenerator(), clock);
    return { store, service: new ContentService(store, clock) };
  }

  it('snapshots the state before each change, so a rollback has something to return to', async () => {
    const { service } = build();

    const page = await service.create({
      kind: ContentKind.PAGE,
      slug: 'personal/savings',
      title: 'Savings',
      payload: { blocks: [] },
      by: 'adm_01HEDITOR',
    });

    await service.update({
      id: page.id,
      patch: { title: 'Savings accounts' },
      by: 'adm_01HEDITOR',
      note: 'Clearer heading',
    });

    const history = await service.history(page.id);

    expect(history).toHaveLength(1);
    expect(history[0]?.title).toBe('Savings');
    expect(history[0]?.note).toBe('Clearer heading');
  });

  it('restores an earlier revision, and the restore is itself undoable', async () => {
    const { service } = build();

    const page = await service.create({
      kind: ContentKind.PAGE,
      slug: 'personal/current-accounts',
      title: 'Current accounts',
      payload: { blocks: [] },
      by: null,
    });

    await service.update({ id: page.id, patch: { title: 'A regrettable rewrite' }, by: null });
    const restored = await service.rollback({ id: page.id, revision: 1, by: null });

    expect(restored.title).toBe('Current accounts');

    const history = await service.history(page.id);
    expect(history.map((entry) => entry.title)).toContain('A regrettable rewrite');
  });

  it('refuses a second document at the same address', async () => {
    const { service } = build();

    await service.create({
      kind: ContentKind.PAGE,
      slug: 'home',
      title: 'Home',
      payload: {},
      by: null,
    });

    await expect(
      service.create({
        kind: ContentKind.PAGE,
        slug: 'home',
        title: 'Home again',
        payload: {},
        by: null,
      }),
    ).rejects.toThrow(/already/i);
  });

  it('allows the same slug under a different kind, because they are different routes', async () => {
    const { service } = build();

    await service.create({
      kind: ContentKind.PAGE,
      slug: 'savings',
      title: 'Savings',
      payload: {},
      by: null,
    });

    await expect(
      service.create({
        kind: ContentKind.POST,
        slug: 'savings',
        title: 'On saving',
        payload: {},
        by: null,
      }),
    ).resolves.toMatchObject({ kind: ContentKind.POST });
  });
});
