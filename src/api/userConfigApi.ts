import type { UserConfigSnapshot } from '../types';
import { isValidUsername, verifyLocalCredentials } from '../utils/localAuth';

const AUTH_TOKEN_KEY = 'lich-auth-token';
const AUTH_USER_KEY = 'lich-auth-user';
const AUTH_MODE_KEY = 'lich-auth-mode';
const LOCAL_CONFIG_PREFIX = 'lich-user-config:';

export type AuthMode = 'server' | 'browser';

export interface AuthSession {
  token: string;
  username: string;
  mode: AuthMode;
}

class ApiUnavailableError extends Error {
  constructor(message = 'API unavailable') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiUnavailableError) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    return /kết nối|failed to fetch|network|502|503|504/i.test(err.message);
  }
  return false;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
  } catch {
    throw new ApiUnavailableError(
      'Không kết nối được server. Chạy npm run dev:all (cần cả API ở cổng 3001).',
    );
  }
  if (!res.ok) {
    // Vercel static deploy often returns HTML 404 for /api/*
    if (res.status === 404 || res.status === 405) {
      throw new ApiUnavailableError('API không có trên môi trường này');
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Lỗi server (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function getStoredSession(): AuthSession | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const username = localStorage.getItem(AUTH_USER_KEY);
    const modeRaw = localStorage.getItem(AUTH_MODE_KEY);
    if (!token || !username) return null;
    const mode: AuthMode =
      modeRaw === 'browser' || token.startsWith('local:') ? 'browser' : 'server';
    return { token, username, mode };
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession) {
  localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  localStorage.setItem(AUTH_USER_KEY, session.username);
  localStorage.setItem(AUTH_MODE_KEY, session.mode);
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_MODE_KEY);
}

export function loadLocalUserConfig(username: string): UserConfigSnapshot | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_CONFIG_PREFIX}${username}`);
    if (!raw) return null;
    return JSON.parse(raw) as UserConfigSnapshot;
  } catch {
    return null;
  }
}

export function saveLocalUserConfig(username: string, config: UserConfigSnapshot): void {
  const payload: UserConfigSnapshot = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`${LOCAL_CONFIG_PREFIX}${username}`, JSON.stringify(payload));
}

async function loginLocal(username: string, password: string): Promise<AuthSession> {
  const user = username.trim();
  if (!user || !password) {
    throw new Error('Vui lòng nhập tên đăng nhập và mật khẩu');
  }
  if (!isValidUsername(user)) {
    throw new Error('Tên đăng nhập không hợp lệ');
  }
  if (!(await verifyLocalCredentials(user, password))) {
    throw new Error('Sai tên đăng nhập hoặc mật khẩu');
  }
  const session: AuthSession = {
    token: `local:${user}:${Date.now().toString(36)}`,
    username: user,
    mode: 'browser',
  };
  storeSession(session);
  return session;
}

export async function login(username: string, password: string): Promise<AuthSession> {
  try {
    const result = await request<{ token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const session: AuthSession = {
      token: result.token,
      username: result.username,
      mode: 'server',
    };
    storeSession(session);
    return session;
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    // Vercel / không có API → đăng nhập local trên trình duyệt
    return loginLocal(username, password);
  }
}

export async function fetchCurrentUser(
  token: string,
  mode: AuthMode = 'server',
): Promise<{ username: string }> {
  if (mode === 'browser') {
    const session = getStoredSession();
    if (!session || session.token !== token) {
      throw new Error('Phiên đăng nhập không hợp lệ');
    }
    return { username: session.username };
  }
  return request('/api/auth/me', {
    headers: { 'x-auth-token': token },
  });
}

export async function fetchUserConfig(
  token: string,
  mode: AuthMode = 'server',
  username?: string,
): Promise<UserConfigSnapshot | null> {
  if (mode === 'browser') {
    const user = username ?? getStoredSession()?.username;
    if (!user) return null;
    return loadLocalUserConfig(user);
  }
  const result = await request<{ config: UserConfigSnapshot | null }>('/api/user/config', {
    headers: { 'x-auth-token': token },
  });
  return result.config;
}

export async function saveUserConfig(
  token: string,
  config: UserConfigSnapshot,
  mode: AuthMode = 'server',
  username?: string,
): Promise<void> {
  if (mode === 'browser') {
    const user = username ?? getStoredSession()?.username;
    if (!user) throw new Error('Chưa đăng nhập');
    saveLocalUserConfig(user, config);
    return;
  }
  await request('/api/user/config', {
    method: 'PUT',
    headers: { 'x-auth-token': token },
    body: JSON.stringify(config),
  });
}

export async function logout(token: string, mode: AuthMode = 'server'): Promise<void> {
  if (mode === 'server') {
    try {
      await request('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-auth-token': token },
      });
    } catch {
      /* ignore */
    }
  }
  clearSession();
}
