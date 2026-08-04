import { HttpStatus } from '@nestjs/common';

import { ErrorCode, type FieldError } from '@reliance/contracts';

/**
 * The only error type the application throws deliberately.
 *
 * Carrying the contract `ErrorCode` means the exception filter never has to guess a
 * status from a message string, and the client never has to parse English. A bare
 * `throw new Error(...)` reaching the filter is treated as an unexpected defect: it is
 * logged with a stack and reported as `INTERNAL_ERROR` with no detail leaked.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: FieldError[] | undefined;
  readonly retryAfterSeconds: number | undefined;
  /** Non-serialised context for the log line only — may contain sensitive detail. */
  readonly context: Record<string, unknown> | undefined;

  constructor(options: {
    code: ErrorCode;
    message: string;
    status?: number;
    details?: FieldError[];
    retryAfterSeconds?: number;
    context?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.status = options.status ?? statusForCode(options.code);
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.context = options.context;
  }

  static notFound(entity: string, id?: string): AppError {
    return new AppError({
      code: ErrorCode.NOT_FOUND,
      message: id ? `${entity} ${id} was not found` : `${entity} was not found`,
      status: HttpStatus.NOT_FOUND,
    });
  }

  static forbidden(reason: string): AppError {
    return new AppError({
      code: ErrorCode.FORBIDDEN,
      message: reason,
      status: HttpStatus.FORBIDDEN,
    });
  }

  static conflict(code: ErrorCode, message: string): AppError {
    return new AppError({ code, message, status: HttpStatus.CONFLICT });
  }

  static validation(message: string, details: FieldError[]): AppError {
    return new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details,
    });
  }
}

/** Codes whose HTTP status differs from the 400 default. */
const STATUS_OVERRIDES: Partial<Record<ErrorCode, number>> = {
  [ErrorCode.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.TOKEN_EXPIRED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.TOKEN_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.TOKEN_REUSE_DETECTED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.MFA_REQUIRED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.STEP_UP_REQUIRED]: HttpStatus.UNAUTHORIZED,

  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ErrorCode.IP_NOT_ALLOWED]: HttpStatus.FORBIDDEN,
  [ErrorCode.ACCOUNT_LOCKED]: HttpStatus.FORBIDDEN,
  [ErrorCode.ACCOUNT_SUSPENDED]: HttpStatus.FORBIDDEN,
  [ErrorCode.KYC_TIER_TOO_LOW]: HttpStatus.FORBIDDEN,
  [ErrorCode.SELF_APPROVAL_FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.FEATURE_DISABLED]: HttpStatus.FORBIDDEN,
  [ErrorCode.SIMULATION_ONLY]: HttpStatus.FORBIDDEN,

  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.ACCOUNT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CARD_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.LOAN_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.BENEFICIARY_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.HOLD_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.QUOTE_NOT_FOUND]: HttpStatus.NOT_FOUND,

  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.EMAIL_ALREADY_REGISTERED]: HttpStatus.CONFLICT,
  [ErrorCode.PHONE_ALREADY_REGISTERED]: HttpStatus.CONFLICT,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: HttpStatus.CONFLICT,
  [ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT]: HttpStatus.CONFLICT,
  [ErrorCode.DISPUTE_ALREADY_RAISED]: HttpStatus.CONFLICT,
  [ErrorCode.DEPOSIT_ALREADY_BROKEN]: HttpStatus.CONFLICT,

  [ErrorCode.PRECONDITION_FAILED]: HttpStatus.PRECONDITION_FAILED,
  [ErrorCode.PAYLOAD_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  [ErrorCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,

  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.UNBALANCED_JOURNAL_ENTRY]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.MAINTENANCE_MODE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.RAIL_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.DEPENDENCY_FAILED]: HttpStatus.BAD_GATEWAY,
};

/** Maps a contract error code to its HTTP status. Business rejections default to 400. */
export function statusForCode(code: ErrorCode): number {
  return STATUS_OVERRIDES[code] ?? HttpStatus.BAD_REQUEST;
}
