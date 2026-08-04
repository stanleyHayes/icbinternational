/**
 * The boundary test.
 *
 * "No route under `/public` may reach customer data" is the rule this whole module exists
 * to keep. A comment saying so is worth nothing; this asserts it three ways, against the
 * code rather than against intent:
 *
 * 1. **Nothing authenticates.** No public controller carries an auth guard, because a
 *    surface that can identify a caller is a surface that can serve them their own data.
 * 2. **Nothing can reach it.** The controllers' injected dependencies are walked, and any
 *    service whose name suggests customer data fails the test.
 * 3. **Nothing unpublished escapes.** A draft page is unreachable by slug even though it
 *    exists, and a live one is served — proving the filter is real rather than an accident
 *    of an empty store.
 */

import 'reflect-metadata';

import { PublishStatus } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { ContentKind, ContentService, InMemoryContentStore } from '../../cms/index.js';
import { PublicContentController } from '../public-content.controller.js';
import { PublicReferenceController } from '../public-reference.controller.js';
import { PublicToolsController } from '../public-tools.controller.js';

const PUBLIC_CONTROLLERS = [
  PublicContentController,
  PublicReferenceController,
  PublicToolsController,
] as const;

/**
 * Names that indicate a dependency capable of reaching a customer.
 *
 * Deliberately broad and matched loosely. A false positive costs a moment's thought; a
 * false negative is a customer's transactions on a cached, unauthenticated URL.
 */
const FORBIDDEN_DEPENDENCIES = [
  'account',
  'auth',
  'balance',
  'beneficiar',
  'card',
  'customer',
  'jwt',
  'ledger',
  'loan',
  'notification',
  'session',
  'statement',
  'transaction',
  'transfer',
  'user',
];

/** Guard metadata Nest writes when `@UseGuards` is applied. */
const GUARDS_METADATA = '__guards__';
const PARAM_TYPES = 'design:paramtypes';

interface Constructible {
  readonly name: string;
}

function dependenciesOf(target: object): string[] {
  const injected = (Reflect.getMetadata(PARAM_TYPES, target) ?? []) as (
    | Constructible
    | undefined
  )[];
  return injected.map((dependency) => dependency?.name ?? 'unknown');
}

function guardsOn(target: object): string[] {
  const guards = (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as Constructible[];
  return guards.map((guard) => guard.name);
}

describe('the public surface cannot reach customer data', () => {
  it.each(PUBLIC_CONTROLLERS)('%p authenticates nobody', (controller) => {
    const names = guardsOn(controller).map((name) => name.toLowerCase());

    expect(names.some((name) => name.includes('jwt') || name.includes('admin'))).toBe(false);
  });

  it.each(PUBLIC_CONTROLLERS)('%p injects nothing that can read a customer', (controller) => {
    const injected = dependenciesOf(controller).map((name) => name.toLowerCase());

    for (const dependency of injected) {
      const offending = FORBIDDEN_DEPENDENCIES.find((banned) => dependency.includes(banned));
      expect(offending).toBeUndefined();
    }
  });

  it('injects only content, rates, locations, calculators and leads', () => {
    const injected = PUBLIC_CONTROLLERS.flatMap((controller) => dependenciesOf(controller)).sort();

    expect(injected).toEqual([
      'CalculatorService',
      'ContentService',
      'LeadService',
      'LocationService',
      'RatesService',
    ]);
  });
});

describe('unpublished content is unreachable from the public surface', () => {
  function buildContentService(): { service: ContentService; store: InMemoryContentStore } {
    const clock = new ClockService();
    const store = new InMemoryContentStore(new IdGenerator(), clock);
    return { service: new ContentService(store, clock), store };
  }

  it('does not serve a draft page even when its slug is known', async () => {
    const { service } = buildContentService();
    const draft = await service.create({
      kind: ContentKind.PAGE,
      slug: 'unreleased-product',
      title: 'Something we have not announced',
      payload: { blocks: [] },
      by: null,
    });

    expect(draft.status).toBe(PublishStatus.DRAFT);

    const controller = new PublicContentController(service);
    await expect(controller.page('unreleased-product')).resolves.toBeNull();
  });

  it('serves a page once it is published, so the filter is real rather than an empty store', async () => {
    const { service, store } = buildContentService();
    const page = await service.create({
      kind: ContentKind.PAGE,
      slug: 'personal/savings',
      title: 'Savings',
      payload: { blocks: [] },
      by: null,
    });

    await store.applyStatus({
      id: page.id,
      status: PublishStatus.PUBLISHED,
      scheduledFor: null,
      publishedAt: store.now,
      at: store.now,
      by: null,
    });

    const controller = new PublicContentController(service);
    const served = await controller.page('personal/savings');

    expect(served?.slug).toBe('personal/savings');
    expect(served?.status).toBe(PublishStatus.PUBLISHED);
  });

  it('does not serve a scheduled page before its time', async () => {
    const { service, store } = buildContentService();
    const page = await service.create({
      kind: ContentKind.PAGE,
      slug: 'rate-change-announcement',
      title: 'A change to our savings rates',
      payload: { blocks: [] },
      by: null,
    });

    await store.applyStatus({
      id: page.id,
      status: PublishStatus.SCHEDULED,
      scheduledFor: new Date(store.now.getTime() + 60_000),
      publishedAt: null,
      at: store.now,
      by: null,
    });

    const controller = new PublicContentController(service);
    await expect(controller.page('rate-change-announcement')).resolves.toBeNull();
  });
});
