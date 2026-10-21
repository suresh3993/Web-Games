import type { ApiErrorBody, ApiErrorCode } from '@playverse/shared-types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

// ---------------------------------------------------------------------------
// CSRF token (double-submit). Kept in memory only; refreshed on demand.
// ---------------------------------------------------------------------------
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  csrfRequest ??= fetch(`${API_BASE}/auth/csrf`, { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, 'INTERNAL_ERROR', 'Could not start a secure session.');
      const body = (await res.json()) as { data: { csrfToken: string } };
      csrfToken = body.data.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      csrfRequest = null;
    });
  return csrfRequest;
}

/** Test hook. */
export function resetCsrfToken() {
  csrfToken = null;
  csrfRequest = null;
}

type QueryValue = string | number | boolean | undefined | null | readonly (string | number)[];

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Let the request outlive the page (e.g. submitting a round while the tab closes). */
  keepalive?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, options: RequestOptions, retried: boolean): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE_METHODS.has(method)) headers['X-CSRF-Token'] = await getCsrfToken();

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      keepalive: options.keepalive,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  // A stale CSRF token (e.g. cookie expired) is refreshed once, transparently.
  if (res.status === 403 && UNSAFE_METHODS.has(method) && !retried) {
    const body = (await res.clone().json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error.code === 'CSRF_INVALID') {
      resetCsrfToken();
      return send(path, options, true);
    }
  }
  return res;
}

/** Calls the PLAYVERSE API and unwraps `{ data }`. Throws `ApiError` on failure. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options, false);
  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as ({ data: T } & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const error = body?.error;
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.fields ?? {},
    );
  }
  return body!.data;
}

/** Like `api` but keeps pagination `meta`. */
export async function apiPaginated<T, M>(path: string, options: RequestOptions = {}): Promise<{ data: T[]; meta: M }> {
  const res = await send(path, options, false);
  const body = (await res.json().catch(() => null)) as ({ data: T[]; meta: M } & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    throw new ApiError(res.status, body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.message ?? 'Something went wrong.');
  }
  return body;
}
