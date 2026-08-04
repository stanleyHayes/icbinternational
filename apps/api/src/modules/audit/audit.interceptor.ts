import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { concatMap, from, map, type Observable } from 'rxjs';

import {
  actorFrom,
  ipAddressFrom,
  readStringPath,
  traceIdFrom,
  userAgentFrom,
  type AuditableRequest,
} from './audit-request.js';
import { AuditService } from './audit.service.js';
import {
  AUDITED_METADATA,
  DEFAULT_ENTITY_ID_PATH,
  type AuditedOptions,
  type AuditSubjectLoader,
} from './audited.decorator.js';

/**
 * Turns `@Audited()` into a chained audit event.
 *
 * The order is: snapshot the subject **before** the handler runs, run the handler,
 * snapshot it again, diff, record. The first snapshot has to happen first because
 * afterwards the old values are gone — there is nowhere else to recover them from.
 *
 * Registered globally by `AuditModule`, so the decorator alone is the whole API. A
 * controller cannot opt out of auditing by forgetting a `UseInterceptors`.
 *
 * **Why the write does not fail the request.** By the time this runs the mutation has
 * already committed. Turning an audit-write failure into a 500 would tell the client its
 * transfer failed when it did not, and a well-behaved client retries a 500 — producing a
 * second transfer to fix a logging problem. The event is instead logged at error level,
 * which is the honest signal that the trail has a hole and needs backfilling. (When A-10
 * lands, the correct destination for a failed write is the dead-letter queue; see
 * `docs/HANDOFFS.md`.)
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_METADATA,
      context.getHandler(),
    );

    if (!options || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuditableRequest>();
    const requestEntityId = readStringPath(request, options.entityIdFrom ?? DEFAULT_ENTITY_ID_PATH);
    const loader = this.resolveLoader(options);

    return from(loadSnapshot(loader, requestEntityId)).pipe(
      concatMap((before) =>
        next
          .handle()
          .pipe(
            concatMap((payload) =>
              from(this.write({ options, request, loader, requestEntityId, before, payload })).pipe(
                map(() => payload),
              ),
            ),
          ),
      ),
    );
  }

  /**
   * Resolves the loader from the container.
   *
   * `strict: false` because the loader lives in the feature module that declared it — an
   * accounts repository has no business being re-provided inside the audit module.
   */
  private resolveLoader(options: AuditedOptions): AuditSubjectLoader | null {
    if (!options.subjectLoader) return null;

    try {
      return this.moduleRef.get<AuditSubjectLoader>(options.subjectLoader, { strict: false });
    } catch {
      this.logger.error(
        `@Audited({ action: '${options.action}' }) names a subjectLoader that no module ` +
          'provides. The event will be recorded without a before/after diff.',
      );
      return null;
    }
  }

  private async write(capture: AuditCapture): Promise<void> {
    const { options, request, loader } = capture;
    const entityId = capture.requestEntityId ?? entityIdFromPayload(capture.payload);

    try {
      await this.audit.record({
        actor: actorFrom(request),
        action: options.action,
        entity: options.entity,
        entityId: entityId ?? this.unattributed(options),
        before: capture.before,
        // With a loader, both sides come from the persisted record, so the diff compares
        // like with like. Without one, the handler's return is the only statement of the
        // new state available — and `before` is null in that case, so the two can never
        // be diffed against each other and produce nonsense.
        after: loader ? await loadSnapshot(loader, entityId) : snapshotOf(capture.payload),
        ipAddress: ipAddressFrom(request),
        userAgent: userAgentFrom(request),
        traceId: traceIdFrom(request),
        allowFields: options.captureFields,
      });
    } catch (error) {
      this.logger.error(
        { action: options.action, entity: options.entity, entityId },
        error instanceof Error ? error.stack : String(error),
        'Audit write failed AFTER the change committed — the trail is incomplete',
      );
    }
  }

  /**
   * Filing an event whose subject cannot be identified.
   *
   * This only happens when `entityIdFrom` points at nothing and the handler returns no
   * `id` — a decorator misconfiguration. The event is still recorded, under a sentinel,
   * because losing the record entirely would hide the very change being audited.
   */
  private unattributed(options: AuditedOptions): string {
    this.logger.error(
      `@Audited({ action: '${options.action}' }) could not determine an entity id. ` +
        'Set entityIdFrom to the route parameter that carries it.',
    );
    return UNKNOWN_ENTITY_ID;
  }
}

interface AuditCapture {
  readonly options: AuditedOptions;
  readonly request: AuditableRequest;
  readonly loader: AuditSubjectLoader | null;
  readonly requestEntityId: string | null;
  readonly before: Record<string, unknown> | null;
  readonly payload: unknown;
}

const UNKNOWN_ENTITY_ID = 'unknown';

/** A loader is optional, and so is the id it needs. Either absence means no snapshot. */
async function loadSnapshot(
  loader: AuditSubjectLoader | null,
  entityId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!loader || !entityId) return null;
  return loader.loadAuditSubject(entityId);
}

/** The handler's return as a plain object. Mongoose documents are converted, not walked. */
function snapshotOf(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  if (hasToObject(payload)) return payload.toObject() as Record<string, unknown>;
  return payload as Record<string, unknown>;
}

function hasToObject(value: object): value is { toObject: () => unknown } {
  return 'toObject' in value && typeof value.toObject === 'function';
}

/** A creation has no id in the request; the handler's own response is where it appears. */
function entityIdFromPayload(payload: unknown): string | null {
  return readStringPath(payload, 'id') ?? readStringPath(payload, 'data.id');
}
