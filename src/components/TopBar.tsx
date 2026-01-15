// src/components/TopBar.tsx
import React from 'react';
import { Session } from '../lib/auth';
import { t, getLang } from '../i18n';
import BlockedBanner from './BlockedBanner';

export default function TopBar({
  session,
  me,
  onLogout,
  onLangChange
}: {
  session: Session | null;
  me: any;
  onLogout: () => void;
  onLangChange: (lang: string) => void;
}) {
  const lang = getLang();

  return (
    <div className="topbar">
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>{t('appTitle')}</div>
        {session && (
          <div className="small">
            {session.user.username} • {session.user.role} • {session.user.branchName}
            {typeof me?.creditDzd === 'number' ? ` • Kredit: ${me.creditDzd} DZD` : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select value={lang} onChange={(e) => onLangChange(e.target.value)}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>

        {session && <button className="secondary" onClick={onLogout}>{t('logout')}</button>}
      </div>

      {session && me?.blocked ? <BlockedBanner /> : null}
    </div>
  );
}
