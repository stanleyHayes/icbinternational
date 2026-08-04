import { SetMetadata, type Type } from '@nestjs/common';

/** Metadata key the interceptor reads. Namespaced so it cannot collide with a library's. */
export const AUDITED_METADATA = 'reliance:audited';

/** Where the entity id is looked for when the decorator does not say otherwise. */
export const DEFAULT_ENTITY_ID_PATH = 'params.id';

/**
 * Supplies the before/after snapshots for a diff.
 *
 * Implemented by whichever repository already knows how to load the entity — the audit
 * module deliberately does not learn about accounts, cards or loans. The interceptor
 * resolves the token from the DI container, so the loader gets its own dependencies
 * injected normally.
 *
 * Return a plain object (`.toObject()` on a Mongoose document), or `null` when the entity
 * does not exist yet — which is the correct answer for a creation.
 */
export interface AuditSubjectLoader {
  loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null>;
}

export interface AuditedOptions {
  /** Dotted verb naming what happened, e.g. `account.freeze`. */
  readonly action: string;
  /** Entity family, e.g. `account`. Paired with the id in the `{entity,entityId}` index. */
  readonly entity: string;
  /**
   * Dotted path into the request holding the entity id, e.g. `params.accountId`.
   * Defaults to {@link DEFAULT_ENTITY_ID_PATH}; falls back to the response body's `id`
   * so a creation, which has no id in the request, is still attributed correctly.
   */
  readonly entityIdFrom?: string;
  /** Provider implementing {@link AuditSubjectLoader}. Without one, no `before` is captured. */
  readonly subjectLoader?: Type<AuditSubjectLoader>;
  /**
   * Allow-list of field paths to record.
   *
   * Prefer it on PII-dense entities: enumerating the handful of fields that are safe to
   * keep is a defensible position, while enumerating every field that is not is a bet you
   * lose the first time somebody adds a column.
   */
  readonly captureFields?: readonly string[];
}

/**
 * Marks a handler as audited.
 *
 * The interceptor writes the event **after** the handler returns and only when it returns
 * successfully — a rejected operation changed nothing, and recording attempts as though
 * they were changes makes the trail useless for reconstructing state.
 */
export function Audited(options: AuditedOptions): MethodDecorator {
  return SetMetadata(AUDITED_METADATA, options);
}
