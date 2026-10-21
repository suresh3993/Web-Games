import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, resetCsrfToken } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetCsrfToken();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('unwraps { data } and sends credentials', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: { hello: 'world' } }));
    await expect(api('/games/featured')).resolves.toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/featured', expect.objectContaining({ credentials: 'include', method: 'GET' }));
  });

  it('serialises query params, joining arrays and skipping empty values', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: [] }));
    await api('/games', { query: { q: 'snake', difficulty: ['EASY', 'HARD'], category: '', page: 2, device: [] } });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/games?q=snake&difficulty=EASY%2CHARD&page=2');
  });

  it('fetches a CSRF token once and attaches it to unsafe requests', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { csrfToken: 'tok' } }))
      .mockResolvedValueOnce(json(200, { data: { ok: 1 } }))
      .mockResolvedValueOnce(json(200, { data: { ok: 2 } }));
    await api('/auth/login', { method: 'POST', body: { a: 1 } });
    await api('/auth/logout', { method: 'POST' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const loginInit = fetchMock.mock.calls[1]![1]!;
    expect((loginInit.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok');
    expect(loginInit.body).toBe('{"a":1}');
  });

  it('refreshes an expired CSRF token and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { csrfToken: 'old' } }))
      .mockResolvedValueOnce(json(403, { error: { code: 'CSRF_INVALID', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, { data: { csrfToken: 'new' } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }));
    await expect(api('/auth/login', { method: 'POST', body: {} })).resolves.toEqual({ ok: true });
    expect((fetchMock.mock.calls[3]![1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('new');
  });

  it('throws ApiError with code and field errors', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', fields: { email: ['Bad email'] } } }),
    );
    const error = await api('/games').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', fields: { email: ['Bad email'] } });
  });

  it('maps network failures to a friendly NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api('/games')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: { csrfToken: 't' } })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
