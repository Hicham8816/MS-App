export type Role = 'user' | 'admin' | 'supervisor';

export type Session = {
  token: string;
  user: {
    id: number;
    username: string;
    role: Role;
    branchId: number | null;
    branchName: string;
    blocked: boolean;
    lang: 'de' | 'en' | 'fr';
    creditDzd: number;
  };
};

const KEY = 'ps_session';

export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem(KEY);
}
