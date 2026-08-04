/**
 * Moving content through the workflow, and the scheduler that finishes the job.
 *
 * Every transition is checked by the pure state machine in `workflow.ts` — the service
 * does no reasoning of its own about what may follow what, so there is exactly one answer
 * to "can this be published?" in the codebase.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { ErrorCode, PublishStatus } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/config.service.js';
import { SCHEDULE_SWEEP_INTERVAL_MS } from '../cms.constants.js';
import { ContentStore, type ContentRecord } from '../content.store.js';

import { mintPreviewToken, verifyPreviewToken } from './preview-token.js';
import { availableActions, transition, type ContentAction } from './workflow.js';

/** Documents the scheduler publishes in one pass. */
const SWEEP_BATCH = 100;

export interface TransitionInput {
  readonly id: string;
  readonly action: ContentAction;
  readonly by: string | null;
  /** Required by `SCHEDULE`; ignored otherwise. */
  readonly scheduledFor?: Date;
}

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private readonly content: ContentStore,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Applies a workflow action.
   *
   * @throws {AppError} `PRECONDITION_FAILED` when the action is not available from the
   *   document's current state, with a message naming both.
   */
  async apply(input: TransitionInput): Promise<ContentRecord> {
    const current = await this.load(input.id);
    const result = transition(current.status, input.action);

    if (!result.allowed) {
      throw new AppError({
        code: ErrorCode.PRECONDITION_FAILED,
        message: result.reason,
        context: { id: input.id, from: current.status, action: input.action },
      });
    }

    const now = this.clock.now();
    const scheduledFor = this.scheduleFor(result.next, input, now);

    const updated = await this.content.applyStatus({
      id: input.id,
      status: result.next,
      scheduledFor,
      publishedAt: result.next === PublishStatus.PUBLISHED ? now : current.publishedAt,
      at: now,
      by: input.by,
    });

    if (!updated) throw AppError.notFound('Content', input.id);
    return updated;
  }

  /** What an editor may do next, for the console's toolbar. */
  async actionsFor(id: string): Promise<ContentAction[]> {
    const current = await this.load(id);
    return availableActions(current.status);
  }

  /** A signed, expiring link letting the marketing site render an unpublished document. */
  async mintPreview(id: string): Promise<{ token: string; documentId: string }> {
    const current = await this.load(id);
    return {
      documentId: current.id,
      token: mintPreviewToken({
        documentId: current.id,
        secret: this.previewSecret,
        issuedAt: this.clock.now(),
      }),
    };
  }

  /**
   * Resolves a preview token to its document.
   *
   * @throws {AppError} `FORBIDDEN` when the token is unusable. The message never
   *   distinguishes "expired" from "forged" beyond what a reviewer needs, because the
   *   difference is useful only to someone guessing at tokens.
   */
  async resolvePreview(token: string): Promise<ContentRecord> {
    const check = verifyPreviewToken({
      token,
      secret: this.previewSecret,
      now: this.clock.now(),
    });

    if (!check.valid) throw AppError.forbidden(check.reason);
    return this.load(check.documentId);
  }

  /**
   * Publishes everything whose scheduled time has arrived.
   *
   * A poll rather than a timer, so a scheduled publication survives a deployment. It also
   * runs on the bank's clock, which means advancing the business date in the operations
   * console publishes content scheduled for that date — the behaviour an operator expects.
   */
  @Interval(SCHEDULE_SWEEP_INTERVAL_MS)
  async publishDue(): Promise<number> {
    const now = this.clock.now();
    const due = await this.content.findDueForPublishing(now, SWEEP_BATCH);

    for (const record of due) {
      await this.content.applyStatus({
        id: record.id,
        status: PublishStatus.PUBLISHED,
        scheduledFor: null,
        publishedAt: now,
        at: now,
        by: record.updatedBy,
      });
    }

    if (due.length > 0) this.logger.log(`Published ${due.length} scheduled document(s)`);
    return due.length;
  }

  /**
   * The signing key for preview tokens.
   *
   * Reuses the CSRF secret rather than adding an environment variable to a config file
   * this module does not own. Both are HMAC keys of the same class — short-lived,
   * server-only, rotatable — and a handoff note asks for a dedicated `CMS_PREVIEW_SECRET`.
   */
  private get previewSecret(): string {
    return this.config.cookies.csrfSecret;
  }

  private scheduleFor(next: PublishStatus, input: TransitionInput, now: Date): Date | null {
    if (next !== PublishStatus.SCHEDULED) return null;

    if (!input.scheduledFor) {
      throw AppError.validation('Choose when this should go live.', [
        { path: 'scheduledFor', message: 'A scheduled publication needs a date and time.' },
      ]);
    }

    if (input.scheduledFor.getTime() <= now.getTime()) {
      throw AppError.validation('That time has already passed.', [
        { path: 'scheduledFor', message: 'Choose a time in the future, or publish it now.' },
      ]);
    }

    return input.scheduledFor;
  }

  private async load(id: string): Promise<ContentRecord> {
    const found = await this.content.findDocument(id);
    if (!found) throw AppError.notFound('Content', id);
    return found;
  }
}
