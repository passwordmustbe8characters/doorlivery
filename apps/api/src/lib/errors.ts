import type { ErrorRequestHandler, Request, Response } from 'express';
import type { ApiError, ErrorCode } from '@doorlivery/shared';
import { NipostError } from '../nipost/client.js';
import { sendErrorPage } from '../views/error-page.js';

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

/** A browser asking for a page (customer, rider, or a mistyped URL), as opposed to an API call. */
export function wantsHtml(req: Request): boolean {
  return req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts(['json', 'html']) === 'html';
}

// Never log request bodies: they carry coordinates and phone numbers (SPEC 7).
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let code: ErrorCode;
  let message: string;
  if (err instanceof AppError) {
    code = err.code;
    message = err.message;
  } else if (err instanceof NipostError) {
    console.error(`NIPOST ${err.kind}${err.status ? ` (${err.status})` : ''}`);
    code = 'UPSTREAM_ERROR';
    message = 'Postcode service is unavailable';
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    code = 'VALIDATION_ERROR';
    message = 'Invalid JSON body';
  } else if ((err as { status?: number }).status === 404) {
    // e.g. express.static with fallthrough: false (missing /assets file)
    code = 'NOT_FOUND';
    message = 'Not found';
  } else {
    // Name only: messages from drivers can quote SQL parameters (phones, coordinates).
    console.error('Unhandled error:', err instanceof Error ? err.name : 'unknown');
    code = 'SERVER_ERROR';
    message = 'Something went wrong';
  }
  if (wantsHtml(req)) return sendErrorPage(res, STATUS[code]);
  sendError(res, code, message);
};
