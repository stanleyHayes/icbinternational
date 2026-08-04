/**
 * Installs the shipped content on boot, once.
 *
 * A marketing site is required to render entirely from the CMS *and* to survive an empty
 * one. Both are true here: the site reads only what this module serves, and a fresh
 * database gets a real rates page, a real fee schedule and a real branch directory rather
 * than a set of empty states that make the bank look unfinished.
 *
 * Idempotent by slug. Re-running it never overwrites an editor's work — if a document
 * exists at that address, whatever an editor has done to it wins. The catalogue is a
 * starting point, not a source of truth that reasserts itself every restart.
 */

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PublishStatus } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { ContentStore } from '../content.store.js';

import { type CatalogueEntry } from './catalogue.types.js';
import { DIRECTORY_CATALOGUE } from './directory.catalogue.js';
import { HELP_CATALOGUE } from './help.catalogue.js';
import { PAGE_CATALOGUE } from './pages.catalogue.js';
import { RATE_CATALOGUE } from './rates.catalogue.js';

const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  ...PAGE_CATALOGUE,
  ...RATE_CATALOGUE,
  ...HELP_CATALOGUE,
  ...DIRECTORY_CATALOGUE,
]);

@Injectable()
export class ContentInstallerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContentInstallerService.name);

  constructor(
    private readonly content: ContentStore,
    private readonly clock: ClockService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const installed = await this.install();
    if (installed > 0) this.logger.log(`Installed ${installed} content document(s)`);
  }

  /**
   * Writes any catalogue entry that is not already present.
   *
   * @returns how many were written. Zero on every boot after the first.
   */
  async install(): Promise<number> {
    const now = this.clock.now();
    let written = 0;

    for (const entry of CATALOGUE) {
      const existing = await this.content.findBySlug(entry.kind, entry.slug);
      if (existing) continue;

      const created = await this.content.insert(
        {
          kind: entry.kind,
          slug: entry.slug,
          title: entry.title,
          status: PublishStatus.DRAFT,
          locale: 'en-GB',
          seo: entry.seo ?? null,
          payload: entry.payload,
          tags: entry.tags ?? [],
          order: entry.order ?? 0,
          latitudeMicro: entry.latitudeMicro ?? null,
          longitudeMicro: entry.longitudeMicro ?? null,
          scheduledFor: null,
          updatedBy: null,
        },
        now,
      );

      // Shipped content goes live immediately. It has been through review the same way the
      // rest of the codebase has — in a pull request — and a bank whose fee schedule sits
      // in draft on a fresh install is a bank that cannot tell you what it charges.
      await this.content.applyStatus({
        id: created.id,
        status: PublishStatus.PUBLISHED,
        scheduledFor: null,
        publishedAt: now,
        at: now,
        by: null,
      });

      written += 1;
    }

    return written;
  }

  /** The catalogue, for a test that wants to assert against what ships. */
  static get entries(): readonly CatalogueEntry[] {
    return CATALOGUE;
  }
}
