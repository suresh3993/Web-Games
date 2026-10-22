import { z } from 'zod';
import { CHALLENGE_TYPES, GAME_STATUSES, NOTIFICATION_TYPES, REPORT_STATUSES, ROLES } from '@suresh/shared-types';
import {
  achievementInputSchema,
  achievementUpdateSchema,
  adminGameCreateSchema,
  adminGameUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  challengeInputSchema,
  challengeUpdateSchema,
  changePasswordSchema,
  deleteAccountSchema,
  reportUpdateSchema,
  updateProfileSchema,
  userRoleSchema,
  userStatusSchema,
} from '@suresh/validation';

/**
 * OpenAPI paths for profiles, progression, notifications, media and administration.
 * Request bodies come from the same Zod schemas the API validates with.
 */
const body = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) } },
});
const imageBody = (maxMb: number) => ({
  required: true,
  description: `Raw image bytes (PNG, JPEG, WebP or GIF; the type is detected from the bytes), at most ${maxMb} MB. Re-encoded server-side to WebP without metadata.`,
  content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description = 'OK') => ({ description, content: { 'application/json': { schema: { type: 'object', required: ['data'], properties: { data: { type: 'object' } } } } } });
const paginated = { description: 'OK (paginated)', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, meta: { type: 'object' } } } } } };
const err = (description: string) => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const none = (description: string) => ({ description });

const csrf = { in: 'header', name: 'X-CSRF-Token', required: true, schema: { type: 'string' } };
const id = { in: 'path', name: 'id', required: true, schema: { type: 'string' } };
const page = [
  { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
  { in: 'query', name: 'pageSize', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const auth = [{ sessionCookie: [] }];
const common = { 401: err('Not logged in'), 403: err('Forbidden or CSRF'), 429: err('Rate limited') };
const staff = (tag: string, summary: string, extra: Record<string, unknown> = {}) => ({ tags: [tag], summary, security: auth, ...extra });

export const accountAndAdminPaths = {
  // ---- account ----------------------------------------------------------------------
  '/users/me': {
    get: { tags: ['Account'], summary: 'Profile with stats (rounds, play time, wins, achievements, rank, level progress)', security: auth, responses: { 200: ok(), 401: err('Not logged in') } },
    patch: { tags: ['Account'], summary: 'Update the display name', security: auth, parameters: [csrf], requestBody: body(updateProfileSchema), responses: { 200: ok(), 400: err('Validation error'), ...common } },
    delete: {
      tags: ['Account'],
      summary: 'Delete the account and its personal data (password required)',
      description: 'Cascades personal data. Reports and audit entries are kept without the link to the person. The last admin cannot delete their account.',
      security: auth,
      parameters: [csrf],
      requestBody: body(deleteAccountSchema),
      responses: { 204: none('Deleted; the session cookie is cleared'), 400: err('Wrong password'), 409: err('Last administrator'), ...common },
    },
  },
  '/users/me/avatar': {
    put: { tags: ['Account'], summary: 'Upload an avatar (256×256 WebP)', security: auth, parameters: [csrf], requestBody: imageBody(2), responses: { 200: ok(), 400: err('Unreadable or too small image'), 413: err('Too large'), 415: err('Not an accepted image type'), ...common } },
    delete: { tags: ['Account'], summary: 'Remove the avatar', security: auth, parameters: [csrf], responses: { 200: ok(), ...common } },
  },
  '/users/me/password': {
    post: {
      tags: ['Account'],
      summary: 'Change the password; signs out every other session',
      security: auth,
      parameters: [csrf],
      requestBody: body(changePasswordSchema),
      responses: { 204: none('Changed'), 400: err('Wrong current password or weak new password'), ...common },
    },
  },
  '/users/me/export': {
    get: {
      tags: ['Account'],
      summary: 'Download every personal record as a JSON attachment (no secrets)',
      security: auth,
      responses: { 200: { description: 'JSON file', content: { 'application/json': { schema: { type: 'object' } } } }, 401: err('Not logged in'), 429: err('Rate limited') },
    },
  },
  '/users/me/achievements': {
    get: { tags: ['Progression'], summary: 'Achievements with the player’s progress and unlock dates', security: auth, responses: { 200: ok(), 401: err('Not logged in') } },
  },

  // ---- progression --------------------------------------------------------------------
  '/achievements': { get: { tags: ['Progression'], summary: 'Public catalog of active achievements with unlock counts', responses: { 200: ok() } } },
  '/challenges/daily': {
    get: {
      tags: ['Progression'],
      summary: 'Today’s challenges (UTC), with the player’s progress when logged in',
      description: `Generated on first use each day unless an admin scheduled challenges for that day. Types: ${CHALLENGE_TYPES.join(', ')}.`,
      responses: { 200: ok() },
    },
  },
  '/challenges/{id}/progress': {
    post: {
      tags: ['Progression'],
      summary: 'Recompute progress on one of today’s challenges from recorded rounds',
      description: 'The client never sends progress: it is derived from the player’s finished rounds of the day. Completing awards the XP once.',
      security: auth,
      parameters: [id, csrf],
      responses: { 200: ok(), 404: err('Unknown challenge'), 409: err('Not today’s challenge'), ...common },
    },
  },

  // ---- notifications --------------------------------------------------------------------
  '/notifications': {
    get: {
      tags: ['Notifications'],
      summary: `The player’s notifications, newest first (types: ${NOTIFICATION_TYPES.join(', ')})`,
      security: auth,
      parameters: [{ in: 'query', name: 'unread', schema: { type: 'boolean' } }, ...page],
      responses: { 200: paginated, 401: err('Not logged in') },
    },
  },
  '/notifications/unread-count': { get: { tags: ['Notifications'], summary: 'Unread count', security: auth, responses: { 200: ok(), 401: err('Not logged in') } } },
  '/notifications/{id}/read': { post: { tags: ['Notifications'], summary: 'Mark one as read (idempotent)', security: auth, parameters: [id, csrf], responses: { 204: none('Read'), 404: err('Not found'), ...common } } },
  '/notifications/read-all': { post: { tags: ['Notifications'], summary: 'Mark all as read', security: auth, parameters: [csrf], responses: { 204: none('Read'), ...common } } },

  // ---- media --------------------------------------------------------------------------------
  '/media/{id}/{file}': {
    get: {
      tags: ['Media'],
      summary: 'Uploaded image variant (immutable WebP)',
      parameters: [id, { in: 'path', name: 'file', required: true, schema: { type: 'string', example: '640.webp' } }],
      responses: { 200: { description: 'WebP image', content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } } }, 404: err('Not found') },
    },
  },

  // ---- administration ----------------------------------------------------------------------
  '/admin/dashboard': { get: staff('Admin', 'Statistics, 30-day series, top games, categories and platform health (moderator+)', { responses: { 200: ok(), ...common } }) },
  '/admin/users': {
    get: staff('Admin', 'Search users (moderator+)', {
      parameters: [
        { in: 'query', name: 'q', schema: { type: 'string' } },
        { in: 'query', name: 'role', schema: { enum: [...ROLES] } },
        { in: 'query', name: 'status', schema: { enum: ['ACTIVE', 'SUSPENDED'] } },
        { in: 'query', name: 'sort', schema: { enum: ['newest', 'oldest', 'name', 'xp', 'lastLogin'] } },
        ...page,
      ],
      responses: { 200: paginated, ...common },
    }),
  },
  '/admin/users/{id}': { get: staff('Admin', 'User detail with stats and recent activity (moderator+)', { parameters: [id], responses: { 200: ok(), 404: err('Not found'), ...common } }) },
  '/admin/users/{id}/status': {
    patch: staff('Admin', 'Suspend or reactivate (moderators: regular players only; never yourself; never the last admin)', {
      parameters: [id, csrf],
      requestBody: body(userStatusSchema),
      responses: { 200: ok(), 409: err('Last administrator'), 404: err('Not found'), ...common },
    }),
  },
  '/admin/users/{id}/role': {
    patch: staff('Admin', 'Change another user’s role (admin only; never your own)', { parameters: [id, csrf], requestBody: body(userRoleSchema), responses: { 200: ok(), 409: err('Last administrator'), ...common } }),
  },
  '/admin/reports': {
    get: staff('Admin', 'Game reports, open first (moderator+)', { parameters: [{ in: 'query', name: 'status', schema: { enum: [...REPORT_STATUSES] } }, ...page], responses: { 200: paginated, ...common } }),
  },
  '/admin/reports/{id}': {
    patch: staff('Admin', 'Review a report; resolving or dismissing notifies the reporter (moderator+)', { parameters: [id, csrf], requestBody: body(reportUpdateSchema), responses: { 200: ok(), 404: err('Not found'), ...common } }),
  },
  '/admin/games': {
    get: staff('Admin', 'All catalog entries in any status (moderator+ read)', {
      parameters: [
        { in: 'query', name: 'q', schema: { type: 'string' } },
        { in: 'query', name: 'status', schema: { enum: [...GAME_STATUSES] } },
        { in: 'query', name: 'category', schema: { type: 'string' } },
        { in: 'query', name: 'sort', schema: { enum: ['title', 'updated', 'popular', 'status'] } },
        ...page,
      ],
      responses: { 200: paginated, ...common },
    }),
    post: staff('Admin', 'Create a catalog entry (DRAFT or COMING_SOON; runtimes ship with the code)', { parameters: [csrf], requestBody: body(adminGameCreateSchema), responses: { 201: ok('Created'), 409: err('Slug taken'), ...common } }),
  },
  '/admin/games/{id}': {
    get: staff('Admin', 'Game detail (moderator+ read)', { parameters: [id], responses: { 200: ok(), 404: err('Not found'), ...common } }),
    patch: staff('Admin', 'Update metadata or status. Publishing requires a runtime and a finished staff preview round on this deployment.', {
      parameters: [id, csrf],
      requestBody: body(adminGameUpdateSchema),
      responses: { 200: ok(), 409: err('Cannot publish yet'), ...common },
    }),
    delete: staff('Admin', 'Delete an unpublished entry without play history or reports', { parameters: [id, csrf], responses: { 204: none('Deleted'), 409: err('Published or has history'), ...common } }),
  },
  '/admin/games/{id}/thumbnail': {
    put: staff('Admin', 'Upload a thumbnail (WebP at 320, 640 and 960 px)', { parameters: [id, csrf], requestBody: imageBody(5), responses: { 200: ok(), 413: err('Too large'), 415: err('Not an accepted image type'), ...common } }),
    delete: staff('Admin', 'Remove the thumbnail', { parameters: [id, csrf], responses: { 200: ok(), ...common } }),
  },
  '/admin/categories': {
    get: staff('Admin', 'Categories with game counts (moderator+ read)', { responses: { 200: ok(), ...common } }),
    post: staff('Admin', 'Create a category', { parameters: [csrf], requestBody: body(categoryInputSchema), responses: { 201: ok('Created'), 409: err('Slug taken'), ...common } }),
  },
  '/admin/categories/{id}': {
    patch: staff('Admin', 'Update a category', { parameters: [id, csrf], requestBody: body(categoryUpdateSchema), responses: { 200: ok(), ...common } }),
    delete: staff('Admin', 'Delete a category no game uses as its main category', { parameters: [id, csrf], responses: { 204: none('Deleted'), 409: err('In use'), ...common } }),
  },
  '/admin/achievements': {
    get: staff('Admin', 'All achievements with criteria and unlock counts', { responses: { 200: ok(), ...common } }),
    post: staff('Admin', 'Create an achievement', { parameters: [csrf], requestBody: body(achievementInputSchema), responses: { 201: ok('Created'), 400: err('Invalid criteria'), 409: err('Key taken'), ...common } }),
  },
  '/admin/achievements/{id}': {
    patch: staff('Admin', 'Update or (de)activate an achievement', { parameters: [id, csrf], requestBody: body(achievementUpdateSchema), responses: { 200: ok(), ...common } }),
    delete: staff('Admin', 'Delete an achievement nobody has unlocked', { parameters: [id, csrf], responses: { 204: none('Deleted'), 409: err('Already unlocked by players'), ...common } }),
  },
  '/admin/challenges': {
    get: staff('Admin', 'Challenges in a date range (default: ±7 days)', {
      parameters: [{ in: 'query', name: 'from', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } }],
      responses: { 200: ok(), ...common },
    }),
    post: staff('Admin', 'Schedule a challenge for a day', { parameters: [csrf], requestBody: body(challengeInputSchema), responses: { 201: ok('Created'), ...common } }),
  },
  '/admin/challenges/{id}': {
    patch: staff('Admin', 'Update a challenge', { parameters: [id, csrf], requestBody: body(challengeUpdateSchema), responses: { 200: ok(), ...common } }),
    delete: staff('Admin', 'Delete a challenge nobody has completed', { parameters: [id, csrf], responses: { 204: none('Deleted'), 409: err('Already completed by players'), ...common } }),
  },
  '/admin/audit-logs': {
    get: staff('Admin', 'Security and admin events (admin only)', {
      parameters: [
        { in: 'query', name: 'action', schema: { type: 'string' }, description: 'Prefix, e.g. "admin."' },
        { in: 'query', name: 'actorId', schema: { type: 'string' } },
        { in: 'query', name: 'targetType', schema: { type: 'string' } },
        { in: 'query', name: 'targetId', schema: { type: 'string' } },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } },
        ...page,
      ],
      responses: { 200: paginated, ...common },
    }),
  },
};
