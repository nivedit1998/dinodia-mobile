// src/api/auth.ts
import { ENV } from '../config/env';
import type { Role } from '../models/roles';

export type AuthUser = {
  id: number;
  username: string;
  role: Role;
};

type LoginResponse = {
  ok: boolean;
  role?: Role;
  user?: AuthUser;
  error?: string;
};

const LOGIN_PATH = '/auth/login'; // you implement this path on your backend

async function apiFetch<T>(path: string, options: RequestInit): Promise<T> {
  const url = `${ENV.AUTH_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    throw new Error((data as any).error || `HTTP ${res.status}`);
  }
  return data;
}

export async function loginWithCredentials(
  username: string,
  password: string
): Promise<AuthUser> {
  const body = JSON.stringify({ username, password });
  const data = await apiFetch<LoginResponse>(LOGIN_PATH, {
    method: 'POST',
    body,
  });

  if (!data.ok || !data.user) {
    throw new Error(data.error || 'Invalid credentials');
  }

  return data.user;
}

// For change password endpoints, mirror your Next.js:
// - /admin/profile/change-password
// - /tenant/profile/change-password
export async function changePassword(opts: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  role: Role;
}): Promise<void> {
  const path =
    opts.role === 'ADMIN'
      ? '/auth/admin/change-password'
      : '/auth/tenant/change-password';
  await apiFetch<{ ok: boolean }>(path, {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: opts.currentPassword,
      newPassword: opts.newPassword,
      confirmNewPassword: opts.confirmNewPassword,
    }),
  });
}

// Logout: just clear local session on mobile.
// If your backend issues cookies, you may also call a /logout endpoint.
export async function logoutRemote(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    // ignore
  }
}
