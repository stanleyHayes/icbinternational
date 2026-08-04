import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

import { ErrorCode, TRACE_HEADER, type ApiError } from '@reliance/contracts';
import { CurrencyMismatchError, InvalidAmountError, MoneyError } from '@reliance/money';

import { ClockService } from '../clock/clock.service.js';

import { AppError } from './app-error.js';

/**
 * Renders every failure in the contract's error envelope.
 *
 * Three principles: the client always receives a code it can branch on; nothing about the
 * server's internals leaks in the message; and every response carries the trace id that
 * ties it to the log line, so "it failed" can always be turned into "here is why".
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  constructor(private readonly clock: ClockService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const traceId = String(request.headers[TRACE_HEADER] ?? 'untraced');

    const error = this.normalise(exception);
    this.log(error, exception, request, traceId);

    const body: ApiError = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        traceId,
        at: this.clock.now().toISOString(),
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      },
    };

    if (error.retryAfterSeconds) response.setHeader('Retry-After', error.retryAfterSeconds);
    response.status(error.status).json(body);
  }

  /** Converts anything thrown into an `AppError` without leaking internals. */
  private normalise(exception: unknown): AppError {
    if (exception instanceof AppError) return exception;
    if (exception instanceof MoneyError) return fromMoneyError(exception);
    if (exception instanceof HttpException) return fromHttpException(exception);

    return new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong on our side. The incident has been logged.',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }

  private log(error: AppError, original: unknown, request: Request, traceId: string): void {
    const summary = `${request.method} ${request.url} → ${error.status} ${error.code}`;
    const meta = { traceId, context: error.context };

    if (error.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = original instanceof Error ? original.stack : String(original);
      this.logger.error({ ...meta, message: error.message }, stack, summary);
      return;
    }

    // Expected business rejections are information, not incidents.
    this.logger.debug({ ...meta, message: error.message }, summary);
  }
}

function fromMoneyError(exception: MoneyError): AppError {
  if (exception instanceof CurrencyMismatchError) {
    return new AppError({ code: ErrorCode.CURRENCY_MISMATCH, message: exception.message });
  }
  if (exception instanceof InvalidAmountError) {
    return new AppError({ code: ErrorCode.INVALID_AMOUNT, message: exception.message });
  }
  return new AppError({ code: ErrorCode.INVALID_AMOUNT, message: exception.message });
}

function fromHttpException(exception: HttpException): AppError {
  const status = exception.getStatus();
  const codeByStatus: Record<number, ErrorCode> = {
    [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
    [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
    [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
    [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
    [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
    [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  };

  return new AppError({
    code: codeByStatus[status] ?? ErrorCode.INTERNAL_ERROR,
    message: exception.message,
    status,
  });
}
