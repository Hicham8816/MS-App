// src/pages/Login.tsx
import React, { useState } from 'react';
import { api } from '../lib/api';
import { saveSession, Session } from '../lib/auth';
import { t } from '../i18n';

export default function Login({ onLogin, onRegister }: { onLogin: (s: Session) => void; onRegister: () => void }) {
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('user');
  const [err, setErr] = useState<string>('');

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>{t('login')}</h2>

      <div className="field">
        <div className="small">{t('username')}</div>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>

      <div className="field">
        <div className="small">{t('password')}</div>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      {err ? <div className="bad small">{err}</div> : null}

      <div className="row" style={{ marginTop: 10 }}>
        <button
          onClick={async () => {
            setErr('');
            try {
              const s = await api<Session>('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
              });
              saveSession(s);
              onLogin(s);
            } catch (e: any) {
              setErr(e?.error || 'Login fehlgeschlagen');
            }
          }}
        >
          {t('login')}
        </button>

        <button className="secondary" onClick={onRegister}>
          {t('register')}
        </button>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        Demo: user/user • admin/admin • supervisor/supervisor
      </div>
    </div>
  );
}
