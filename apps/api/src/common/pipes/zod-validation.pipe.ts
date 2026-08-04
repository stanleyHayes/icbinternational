import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { type ZodType } from 'zod';

import { type FieldError } from '@reliance/contracts';

import { AppError } from '../errors/app-error.js';

/**
 * Validates a handler argument against the contract schema attached to it.
 *
 * The same Zod schema validates the request here and the form in the browser, so a rule
 * cannot drift between the two. Failures are reported field-by-field rather than as a
 * single opaque message — the client renders them directly next to the offending input.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const details: FieldError[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || metadata.type,
      message: issue.message,
    }));

    throw AppError.validation(describeFailure(details, metadata), details);
  }
}

function describeFailure(details: FieldError[], metadata: ArgumentMetadata): string {
  const [first] = details;
  if (details.length === 1 && first) return `${first.path}: ${first.message}`;
  return `${details.length} fields in the ${metadata.type} failed validation`;
}

/** Factory so a controller can write `@Body(zodBody(createTransferRequestSchema))`. */
export function zodBody(schema: ZodType): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}
