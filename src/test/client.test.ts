import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api, refreshClient, registerSessionExpiredHandler, toApiError } from '@/api/client';
import { friendlyMessage, NETWORK_ERROR_MESSAGE, SERVER_ERROR_MESSAGE } from '@/api/errors';
import { useAuthStore } from '@/stores/authStore';

const response = (status: number, data: unknown) =>
  ({ status, data, statusText: '', headers: {}, config: {} as never }) as AxiosResponse;

describe('toApiError', () => {
  it('maps a network failure to a friendly message', () => {
    expect(toApiError(new AxiosError('Network Error')).message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('extracts the backend message and field errors from a 422', () => {
    // Backend error body: { success: false, message, error: { code, details: [{ path, message }] }, requestId }
    const err = new AxiosError('x', '400', undefined, undefined, response(422, {
      success: false,
      message: 'Validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ path: 'email', message: 'Already in use' }, { path: 'email', message: 'second message ignored' }] },
    }));
    const out = toApiError(err);
    expect(out.status).toBe(422);
    expect(out.code).toBe('VALIDATION_ERROR');
    expect(out.message).toBe('Validation failed');
    expect(out.fieldErrors).toEqual({ email: 'Already in use' });
  });

  it('renames backend field paths to the names the UI forms use', () => {
    const err = new AxiosError('x', '400', undefined, undefined, response(400, {
      message: 'Request validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ path: 'mobile', message: 'Mobile must be 7-15 digits' }, { path: 'purpose', message: 'Too short' }] },
    }));
    expect(toApiError(err).fieldErrors).toEqual({ phone: 'Mobile must be 7-15 digits', reason: 'Too short' });
  });

  it('never shows 5xx bodies, which can contain internals', () => {
    const err = new AxiosError('x', '500', undefined, undefined, response(500, { message: 'SequelizeDatabaseError: relation "patients" does not exist' }));
    const out = toApiError(err);
    expect(out.message).toBe(SERVER_ERROR_MESSAGE);
    expect(out.message).not.toMatch(/Sequelize/);
  });

  it('keeps a 409 message and exposes its data payload', () => {
    const details = { count: 1, appointments: [{ id: 'a1' }] };
    const err = new AxiosError('x', '409', undefined, undefined, response(409, { message: 'Schedule change would invalidate 1 upcoming appointment(s)', error: { code: 'SCHEDULE_CONFLICT', details } }));
    const out = toApiError(err);
    expect(out.status).toBe(409);
    expect(out.code).toBe('SCHEDULE_CONFLICT');
    expect(out.message).toMatch(/would invalidate/);
    expect(out.data).toEqual(details);
    expect(out.fieldErrors).toBeUndefined();
  });

  it('has plain-language defaults for 401, 403 and 404', () => {
    expect(friendlyMessage(401)).toMatch(/session has expired/i);
    expect(friendlyMessage(403)).toMatch(/permission/i);
    expect(friendlyMessage(404)).toMatch(/couldn.t find/i);
    expect(toApiError(new Error('boom')).message).toBe('boom');
  });
});

describe('401 refresh interceptor', () => {
  const originalApiAdapter = api.defaults.adapter;
  const originalRefreshAdapter = refreshClient.defaults.adapter;
  const onExpired = vi.fn();
  let seenAuth: string[];
  let seenCsrf: Array<string | null>;
  let csrfFetches: number;
  let refreshCalls: number;

  const ok = (config: InternalAxiosRequestConfig, data: unknown) =>
    Promise.resolve({ data: { success: true, message: 'ok', data }, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse);
  const unauthorized = (config: InternalAxiosRequestConfig) =>
    Promise.reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, {
      status: 401, data: { message: 'Token expired' }, statusText: 'Unauthorized', headers: {}, config,
    }));

  /** Accepts only the refreshed token. */
  const strictResource: AxiosAdapter = (config) => {
    seenAuth.push(String(config.headers.get('Authorization')));
    return config.headers.get('Authorization') === 'Bearer new-token' ? ok(config, { x: 1 }) : unauthorized(config);
  };
  const alwaysUnauthorized: AxiosAdapter = (config) => {
    seenAuth.push(String(config.headers.get('Authorization')));
    return unauthorized(config);
  };
  /** The bare refresh client serves both GET /auth/csrf and POST /auth/refresh. */
  const refreshOk: AxiosAdapter = async (config) => {
    if (config.url === '/auth/csrf') {
      csrfFetches++;
      return ok(config, { csrfToken: 'csrf-fetched' });
    }
    refreshCalls++;
    seenCsrf.push(config.headers.get('X-CSRF-Token') as string | null);
    await new Promise((r) => setTimeout(r, 10)); // lets concurrent 401s pile up behind one refresh
    return ok(config, { accessToken: 'new-token', csrfToken: 'csrf-rotated', user: { _id: 'u1', name: 'U', email: 'u@example.org', role: 'DOCTOR' } });
  };
  const refreshFails: AxiosAdapter = async (config) => {
    if (config.url === '/auth/csrf') return ok(config, { csrfToken: 'csrf-fetched' });
    refreshCalls++;
    return unauthorized(config);
  };

  beforeEach(() => {
    seenAuth = [];
    seenCsrf = [];
    csrfFetches = 0;
    refreshCalls = 0;
    onExpired.mockClear();
    registerSessionExpiredHandler(onExpired);
    useAuthStore.setState({ user: { id: 'u1', name: 'U', email: 'u@example.org', role: 'DOCTOR' }, accessToken: 'old-token', csrfToken: 'csrf-1', initialized: true });
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    refreshClient.defaults.adapter = originalRefreshAdapter;
  });

  it('refreshes once and retries the request with the new token', async () => {
    api.defaults.adapter = strictResource;
    refreshClient.defaults.adapter = refreshOk;
    const res = await api.get('/things');
    expect(res.data.data).toEqual({ x: 1 });
    expect(seenAuth).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(refreshCalls).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('sends the CSRF token the backend requires and keeps the rotated one; maps the returned user', async () => {
    api.defaults.adapter = strictResource;
    refreshClient.defaults.adapter = refreshOk;
    await api.get('/things');
    expect(seenCsrf).toEqual(['csrf-1']);
    expect(csrfFetches).toBe(0);
    expect(useAuthStore.getState().csrfToken).toBe('csrf-rotated');
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', role: 'DOCTOR' }); // `_id` -> `id`
  });

  it('fetches a CSRF token first when none is in memory (after a page reload)', async () => {
    useAuthStore.setState({ csrfToken: null });
    api.defaults.adapter = strictResource;
    refreshClient.defaults.adapter = refreshOk;
    await api.get('/things');
    expect(csrfFetches).toBe(1);
    expect(seenCsrf).toEqual(['csrf-fetched']);
  });

  it('retries the refresh once with a fresh CSRF token after a 403', async () => {
    let first = true;
    api.defaults.adapter = strictResource;
    refreshClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh' && first) {
        first = false;
        refreshCalls++;
        return Promise.reject(new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, {}, { status: 403, data: { message: 'CSRF token missing or invalid' }, statusText: 'Forbidden', headers: {}, config }));
      }
      return refreshOk(config);
    };
    const res = await api.get('/things');
    expect(res.data.data).toEqual({ x: 1 });
    expect(csrfFetches).toBe(1);
    expect(seenCsrf).toEqual(['csrf-fetched']);
  });

  it('shares a single refresh between concurrent 401s', async () => {
    api.defaults.adapter = strictResource;
    refreshClient.defaults.adapter = refreshOk;
    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);
    expect(a.data.data).toEqual({ x: 1 });
    expect(b.data.data).toEqual({ x: 1 });
    expect(refreshCalls).toBe(1);
  });

  it('ends the session when the refresh fails', async () => {
    api.defaults.adapter = strictResource;
    refreshClient.defaults.adapter = refreshFails;
    await expect(api.get('/things')).rejects.toMatchObject({ response: { status: 401 } });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(seenAuth).toHaveLength(1); // no retry without a new token
  });

  it('never loops: one refresh and one retry at most', async () => {
    api.defaults.adapter = alwaysUnauthorized;
    refreshClient.defaults.adapter = refreshOk;
    await expect(api.get('/things')).rejects.toMatchObject({ response: { status: 401 } });
    expect(seenAuth).toHaveLength(2);
    expect(refreshCalls).toBe(1);
  });

  it('does not try to refresh a failed login', async () => {
    api.defaults.adapter = alwaysUnauthorized;
    refreshClient.defaults.adapter = refreshOk;
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(0);
    expect(onExpired).not.toHaveBeenCalled();
  });
});
