import { getSession } from './auth';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const s = getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;

  const res = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as any) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}
