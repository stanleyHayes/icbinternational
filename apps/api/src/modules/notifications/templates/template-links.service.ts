import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../config/config.service.js';

import { type TemplateLinks } from './define-template.js';

/** Paths that are the same in every message that points at them. */
const PREFERENCES_PATH = '/settings/notifications';
const HELP_PATH = '/help';

/**
 * Positions of the front ends in `AppConfigService.allowedOrigins`.
 *
 * That getter returns `[marketing, client, admin]` and is the only accessor the config
 * service exposes for these URLs. Reading it positionally is brittle, so a handoff note
 * asks the config owner for a named `webUrls` getter; until then the ordering is asserted
 * here in one place rather than assumed at each call site.
 */
const ORIGIN_INDEX = Object.freeze({ marketing: 0, client: 1 });

/**
 * Builds the absolute destinations a template is allowed to point at.
 *
 * Origins come from configuration, so the same template links to `localhost:3001` in
 * development and to the real client app in production without a conditional anywhere near
 * the copy.
 */
@Injectable()
export class TemplateLinksService {
  constructor(private readonly config: AppConfigService) {}

  build(): TemplateLinks {
    const origins = this.config.allowedOrigins;
    const app = (path: string): string => join(origins[ORIGIN_INDEX.client] ?? '', path);
    const site = (path: string): string => join(origins[ORIGIN_INDEX.marketing] ?? '', path);

    return {
      app,
      site,
      preferences: app(PREFERENCES_PATH),
      help: site(HELP_PATH),
    };
  }
}

function join(origin: string, path: string): string {
  const base = origin.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
