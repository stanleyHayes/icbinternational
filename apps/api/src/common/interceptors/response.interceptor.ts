import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Wraps bare handler returns in the contract's `{ data }` envelope.
 *
 * Handlers return the resource itself, which keeps them readable and testable. Anything
 * already shaped as an envelope — a paginated list, an explicit `{ data }`, or a stream —
 * passes through untouched, so a handler that needs full control still has it.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(wrap));
  }
}

function wrap(payload: unknown): unknown {
  if (payload === undefined || payload === null) return { data: null };
  if (isAlreadyEnveloped(payload)) return payload;
  if (Buffer.isBuffer(payload)) return payload;
  return { data: payload };
}

function isAlreadyEnveloped(payload: unknown): boolean {
  return (
    typeof payload === 'object' && payload !== null && ('data' in payload || 'error' in payload)
  );
}
