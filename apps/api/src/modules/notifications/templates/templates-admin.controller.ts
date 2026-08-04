import { Controller, Get, Param } from '@nestjs/common';

import { Permission, routes } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { AdminEndpoint } from '../../rbac/index.js';
import { type TemplatePreview, type TemplateSummary } from '../notifications.dto.js';

import { lintEmail } from './html-email-lint.js';
import { TemplateLinksService } from './template-links.service.js';
import { isTemplateKey, templateFor, TEMPLATE_KEYS } from './template-registry.js';

const KEY_PARAM = 'key';

/**
 * The message catalogue, for the operations console.
 *
 * Staff can see every message the bank is capable of sending and read the exact rendering
 * a customer would receive, against the template's own fixture. That matters when
 * somebody asks "what does the arrears email actually say?" — the answer should be the
 * message, not a developer's recollection of it.
 *
 * Read-only. Copy is code and goes through review; an endpoint that let it be edited at
 * runtime would put regulated wording outside version control.
 */
@Controller()
export class TemplatesAdminController {
  constructor(private readonly links: TemplateLinksService) {}

  @Get(routes.admin.templates)
  @AdminEndpoint(Permission.COMMS_SEND)
  list(): TemplateSummary[] {
    const links = this.links.build();

    return TEMPLATE_KEYS.map((key) => {
      const template = templateFor(key);
      return {
        key,
        category: template.category,
        severity: template.severity,
        channels: [...template.channels],
        urgent: template.urgent,
        subject: template.renderFixture(links).subject,
      };
    });
  }

  /** @throws {AppError} `NOT_FOUND` when no message goes by that name. */
  @Get(`${routes.admin.templates}/:${KEY_PARAM}/preview`)
  @AdminEndpoint(Permission.COMMS_SEND)
  preview(@Param(KEY_PARAM) key: string): TemplatePreview {
    if (!isTemplateKey(key)) throw AppError.notFound('Message template', key);

    const rendered = templateFor(key).renderFixture(this.links.build());

    return {
      key,
      subject: rendered.subject,
      preheader: rendered.preheader,
      html: rendered.html,
      text: rendered.text,
      lintFindings: lintEmail({
        html: rendered.html,
        text: rendered.text,
        subject: rendered.subject,
        preheader: rendered.preheader,
      }),
    };
  }
}
