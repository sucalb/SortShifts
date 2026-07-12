import type { UserConfigSnapshot } from '../types';

const AUTH_TOKEN_KEY = 'lich-auth-token';
const AUTH_USER_KEY = 'lich-auth-user';

export interface AuthSession {
  token: string;
  username: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Lỗi kết nối server');
  }
  return res.json() as Promise<T>;
}

export function getStoredSession(): AuthSession | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const username = localStorage.getItem(AUTH_USER_KEY);
    if (!token || !username) return null;
    return { token, username };
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession) {
  localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  localStorage.setItem(AUTH_USER_KEY, session.username);
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const result = await request<{ token: string; username: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const session = { token: result.token, username: result.username };
  storeSession(session);
  return session;
}

export async function fetchCurrentUser(token: string): Promise<{ username: string }> {
  return request('/api/auth/me', {
    headers: { 'x-auth-token': token },
  });
}

export async function fetchUserConfig(token: string): Promise<UserConfigSnapshot | null> {
  const result = await request<{ config: UserConfigSnapshot | null }>('/api/user/config', {
    headers: { 'x-auth-token': token },
  });
  return result.config;
}

export async function saveUserConfig(token: string, config: UserConfigSnapshot): Promise<void> {
  await request('/api/user/config', {
    method: 'PUT',
    headers: { 'x-auth-token': token },
    body: JSON.stringify(config),
  });
}

export async function logout(token: string): Promise<void> {
  try {
    await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-auth-token': token },
    });
  } catch {
    /* ignore */
  }
  clearSession();
}
