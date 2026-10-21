import { z } from 'zod';
import {
  DEVICE_TYPES,
  DIFFICULTIES,
  GAME_ENGINES,
  GAME_SORTS,
  LICENSE_TYPES,
  PUBLIC_GAME_STATUSES,
  ROLES,
} from '@playverse/shared-types';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@playverse/validation';

/**
 * OpenAPI 3.1 document. Request bodies are generated from the same Zod schemas the
 * API validates with, so the documentation cannot drift from the validation rules.
 */
const body = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const dataOf = (schema: object) => ({ type: 'object', required: ['data'], properties: { data: schema } });
const error = (description: string) => json(ref('Error'), description);

const csrfHeader = { in: 'header', name: 'X-CSRF-Token', required: true, schema: { type: 'string' }, description: 'Token from GET /auth/csrf' };
const slugParam = { in: 'path', name: 'slug', required: true, schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } };

const categoryBrief = {
  type: 'object',
  properties: { slug: { type: 'string' }, name: { type: 'string' }, icon: { type: 'string' }, accentColor: { type: 'string' } },
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'PLAYVERSE API',
    version: '1.0.0',
    description:
      'REST API for the PLAYVERSE gaming platform. Authentication uses an HttpOnly session cookie. ' +
      'All state-changing requests require the `X-CSRF-Token` header obtained from `GET /auth/csrf`.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [{ name: 'Auth' }, { name: 'Games' }, { name: 'System' }],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'pv_session', description: '`__Host-pv_session` when served over HTTPS' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              fields: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
              requestId: { type: 'string' },
            },
          },
        },
      },
      Message: dataOf({ type: 'object', properties: { message: { type: 'string' } } }),
      CurrentUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          emailVerified: { type: 'boolean' },
          displayName: { type: 'string' },
          avatarUrl: { type: ['string', 'null'] },
          role: { enum: [...ROLES] },
          xp: { type: 'integer' },
          level: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
          accentColor: { type: 'string' },
          gameCount: { type: 'integer' },
        },
      },
      GameSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          title: { type: 'string' },
          shortDescription: { type: 'string' },
          thumbnailUrl: { type: ['string', 'null'] },
          difficulty: { enum: [...DIFFICULTIES] },
          supportedDevices: { type: 'array', items: { enum: [...DEVICE_TYPES] } },
          estimatedMinutes: { type: 'integer' },
          status: { enum: [...PUBLIC_GAME_STATUSES] },
          playable: { type: 'boolean', description: 'True only when published and the launch flow is implemented.' },
          isFeatured: { type: 'boolean' },
          supportsScores: { type: 'boolean' },
          primaryCategory: categoryBrief,
        },
      },
      GameDetail: {
        allOf: [
          ref('GameSummary'),
          {
            type: 'object',
            properties: {
              description: { type: 'string' },
              instructions: { type: 'string' },
              engine: { enum: [...GAME_ENGINES] },
              supportsProgress: { type: 'boolean' },
              multiplayerMode: { type: ['string', 'null'] },
              licenseType: { enum: [...LICENSE_TYPES] },
              categories: { type: 'array', items: categoryBrief },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness/readiness check (database and Redis)',
        responses: { 200: json(dataOf({ type: 'object' })), 503: json(dataOf({ type: 'object' }), 'Degraded') },
      },
    },
    '/auth/csrf': {
      get: {
        tags: ['Auth'],
        summary: 'Issue a CSRF token (also set as an HttpOnly cookie)',
        responses: { 200: json(dataOf({ type: 'object', properties: { csrfToken: { type: 'string' } } })) },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account and send a verification email',
        description: 'Always returns 202 with the same message whether or not the email is registered (prevents account enumeration).',
        parameters: [csrfHeader],
        requestBody: body(registerSchema),
        responses: { 202: json(ref('Message'), 'Accepted'), 400: error('Validation error'), 403: error('CSRF'), 429: error('Rate limited') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a session cookie',
        parameters: [csrfHeader],
        requestBody: body(loginSchema),
        responses: {
          200: json(dataOf(ref('CurrentUser'))),
          401: error('Invalid email or password'),
          403: error('Account suspended or CSRF'),
          429: error('Rate limited'),
        },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Revoke the current session', parameters: [csrfHeader], responses: { 204: { description: 'Logged out' } } },
    },
    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke every session of the current user',
        security: [{ sessionCookie: [] }],
        parameters: [csrfHeader],
        responses: { 204: { description: 'All sessions revoked' }, 401: error('Not logged in') },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Email a single-use password reset link (valid 1 hour)',
        parameters: [csrfHeader],
        requestBody: body(forgotPasswordSchema),
        responses: { 202: json(ref('Message'), 'Accepted'), 429: error('Rate limited') },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using a reset token; revokes all sessions',
        parameters: [csrfHeader],
        requestBody: body(resetPasswordSchema),
        responses: { 200: json(ref('Message')), 400: error('Invalid/expired token or weak password') },
      },
    },
    '/auth/verify-email': {
      post: {
        tags: ['Auth'],
        summary: 'Confirm an email address using a verification token (valid 24 hours)',
        parameters: [csrfHeader],
        requestBody: body(verifyEmailSchema),
        responses: { 200: json(ref('Message')), 400: error('Invalid or expired token') },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Send a new verification email',
        security: [{ sessionCookie: [] }],
        parameters: [csrfHeader],
        responses: { 202: json(ref('Message'), 'Accepted'), 401: error('Not logged in'), 409: error('Already verified') },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: [{ sessionCookie: [] }],
        responses: { 200: json(dataOf(ref('CurrentUser'))), 401: error('Not logged in') },
      },
    },
    '/games': {
      get: {
        tags: ['Games'],
        summary: 'Search and filter the public catalog (paginated)',
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string', maxLength: 80 } },
          { in: 'query', name: 'category', schema: { type: 'string' } },
          { in: 'query', name: 'difficulty', schema: { type: 'string' }, description: `Comma-separated: ${DIFFICULTIES.join(', ')}` },
          { in: 'query', name: 'device', schema: { type: 'string' }, description: `Comma-separated: ${DEVICE_TYPES.join(', ')}` },
          { in: 'query', name: 'status', schema: { enum: [...PUBLIC_GAME_STATUSES] } },
          { in: 'query', name: 'sort', schema: { enum: [...GAME_SORTS], default: 'popular' } },
          { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
          { in: 'query', name: 'pageSize', schema: { type: 'integer', minimum: 1, maximum: 48, default: 24 } },
        ],
        responses: {
          200: json({
            type: 'object',
            properties: {
              data: { type: 'array', items: ref('GameSummary') },
              meta: {
                type: 'object',
                properties: { page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } },
              },
            },
          }),
          400: error('Invalid query'),
        },
      },
    },
    '/games/featured': {
      get: { tags: ['Games'], summary: 'Featured games', responses: { 200: json(dataOf({ type: 'array', items: ref('GameSummary') })) } },
    },
    '/games/trending': {
      get: { tags: ['Games'], summary: 'Most launched games in the last 7 days', responses: { 200: json(dataOf({ type: 'array', items: ref('GameSummary') })) } },
    },
    '/games/categories': {
      get: { tags: ['Games'], summary: 'Categories with public game counts', responses: { 200: json(dataOf({ type: 'array', items: ref('Category') })) } },
    },
    '/games/{slug}': {
      get: {
        tags: ['Games'],
        summary: 'Game details',
        parameters: [slugParam],
        responses: { 200: json(dataOf(ref('GameDetail'))), 404: error('Not found') },
      },
    },
    '/games/{slug}/related': {
      get: {
        tags: ['Games'],
        summary: 'Games from the same primary category',
        parameters: [slugParam],
        responses: { 200: json(dataOf({ type: 'array', items: ref('GameSummary') })), 404: error('Not found') },
      },
    },
  },
} as const;
