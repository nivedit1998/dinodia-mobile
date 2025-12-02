// src/api/auth.ts
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env';
import type { Role } from '../models/roles';
import { supabase } from './supabaseClient';

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

const LOGIN_PATH = '/auth/login'; // implemented on backend (Next.js / Edge Function)

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
  const trimmedUsername = username.trim();
  if (!trimmedUsername || !password) {
    throw new Error('Username and password are required');
  }

  if (ENV.AUTH_BASE_URL) {
    try {
      const body = JSON.stringify({ username: trimmedUsername, password });
      const data = await apiFetch<LoginResponse>(LOGIN_PATH, {
        method: 'POST',
        body,
      });

      if (!data.ok || !data.user) {
        throw new Error(data.error || 'Invalid credentials');
      }

      return data.user;
    } catch (err) {
      console.warn('[auth] Falling back to Supabase login:', err);
    }
  }

  return await fallbackLoginWithSupabase(trimmedUsername, password);
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

type SupabaseLoginRow = AuthUser & { passwordHash?: string | null };

async function fallbackLoginWithSupabase(username: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase
    .from('User')
    .select('id, username, role, passwordHash')
    .eq('username', username)
    .maybeSingle<SupabaseLoginRow>();

  if (error) {
    throw new Error(error.message || 'Unable to login');
  }

  if (!data) {
    throw new Error('Invalid credentials');
  }

  const { passwordHash } = data;
  if (!passwordHash) {
    throw new Error('Password is not configured for this user');
  }

  const isValid = bcrypt.compareSync(password, passwordHash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const { id, username: uname, role } = data;
  return { id, username: uname, role };
}
