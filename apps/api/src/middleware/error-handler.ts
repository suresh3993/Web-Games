import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { flattenZodError } from '@suresh/validation';
import type { ApiErrorBody } from '@suresh/shared-types';
import { HttpError } from '../lib/http-error';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found.`));
};

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ZodError) {
    return new HttpError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', flattenZodError(err));
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new HttpError(409, 'CONFLICT', 'That resource already exists.');
    if (err.code === 'P2025') return new HttpError(404, 'NOT_FOUND', 'Not found.');
  }
  // body-parser errors
  const status = (err as { status?: number; type?: string })?.status;
  const type = (err as { type?: string })?.type;
  if (type === 'entity.parse.failed') return new HttpError(400, 'BAD_REQUEST', 'Malformed JSON body.');
  if (type === 'entity.too.large') return new HttpError(413, 'BAD_REQUEST', 'Request body is too large.');
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new HttpError(status, 'BAD_REQUEST', 'Bad request.');
  }
  return new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError = toHttpError(err);
  if (httpError.status >= 500) {
    (req.log ?? logger).error({ err }, 'unhandled error');
  }
  const body: ApiErrorBody = {
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.fields ? { fields: httpError.fields } : {}),
      requestId: String(req.id ?? ''),
    },
  };
  res.status(httpError.status).json(body);
};
