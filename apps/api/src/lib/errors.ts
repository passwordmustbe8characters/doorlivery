import type { ErrorRequestHandler, Response } from 'express';
import type { ApiError, ErrorCode } from '@doorlivery/shared';
import { NipostError } from '../nipost/client.js';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  SERVER_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(res: Response, code: ErrorCode, message: string) {
  const body: ApiError = { error: true, message, code };
  res.status(STATUS[code]).json(body);
}

// Never log request bodies: they carry coordinates and phone numbers (SPEC 7).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) return sendError(res, err.code, err.message);
  if (err instanceof NipostError) {
    console.error(`NIPOST ${err.kind}${err.status ? ` (${err.status})` : ''}`);
    return sendError(res, 'UPSTREAM_ERROR', 'Postcode service is unavailable');
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return sendError(res, 'VALIDATION_ERROR', 'Invalid JSON body');
  }
  console.error('Unhandled error:', err instanceof Error ? err.name + ': ' + err.message : 'unknown');
  sendError(res, 'SERVER_ERROR', 'Something went wrong');
};
