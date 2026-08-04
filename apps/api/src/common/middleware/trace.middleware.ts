import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';

import { TRACE_HEADER } from '@reliance/contracts';

/**
 * Stamps every request with a trace id and echoes it back.
 *
 * The same id appears on the error envelope, every log line for the request, and every
 * audit event it produces. A customer reporting "it said something went wrong" can be
 * turned into a precise log query from the trace id alone.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.headers[TRACE_HEADER];
    const traceId = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();

    // Express has no other request-scoped store; downstream guards, the exception
    // filter and the audit writer all read the id back off the request headers.
    // eslint-disable-next-line no-param-reassign
    request.headers[TRACE_HEADER] = traceId;
    response.setHeader(TRACE_HEADER, traceId);
    next();
  }
}
