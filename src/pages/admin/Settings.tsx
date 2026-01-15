import React, { useMemo, useState } from 'react';
import Codes from './Codes';
import Pricing from './Pricing';
import Products from './Products';
import Structure from './Structure';
import { api } from '../../lib/api';

type Role = 'user' | 'admin' | 'supervisor';
type Language = 'de' | 'en' | 'fr';

type Me = {
  id: number;
  username: string;
  role: Role;
  branchId?: number | null;
  blocked?: boolean;
  lang?: Language | null;
};

type Mode = 'products' | 'codes' | 'settings';

type SettingsSubTab = 'pricing' | 'structure' | 'language';

function SegButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: active ? 'var(--panel2)' : 'transparent',
        color: 'var(--text)',
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 10px 30px rgba(0,0,0,.08)'
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function LanguagePanel({ me }: { me: Me }) {
  const [lang, setLang] = useState<Language>((me.lang as Language) || 'de');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const options: Array<{ value: Language; label: string }> = useMemo(
    () => [
      { value: 'de', label: 'Deutsch' },
      { value: 'en', label: 'English' },
      { value: 'fr', label: 'Francais' }
    ],
    []
  );

  async function onSave() {
    setSaving(true);
    setMsg('');
    try {
      await api('/api/me/lang', 'PUT', { lang });
      setMsg('Gespeichert ✅ (Reload...)');
      // Einfach und robust: neu laden damit "me" + UI konsistent ist
      setTimeout(() => window.location.reload(), 350);
    } catch (e: any) {
      setMsg(e?.error || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Sprache">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Language)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--panel2)',
            color: 'var(--text)'
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--accent)',
            color: 'white',
            cursor: saving ? 'default' : 'pointer'
          }}
        >
          {saving ? '...' : 'Speichern'}
        </button>
        {msg ? <span style={{ opacity: 0.85 }}>{msg}</span> : null}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Hinweis: Die UI-Texte sind noch nicht komplett uebersetzt, aber die Sprache wird schon pro Konto gespeichert.
      </div>
    </Card>
  );
}

export default function Settings({ me, mode }: { me: Me; mode: Mode }) {
  // Diese Seite ist ein Router: AdminHome steuert "mode".
  if (mode === 'products') return <Products me={me as any} />;
  if (mode === 'codes') return <Codes me={me as any} />;

  // mode === 'settings'
  const [tab, setTab] = useState<SettingsSubTab>('pricing');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>Einstellungen</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SegButton active={tab === 'pricing'} onClick={() => setTab('pricing')}>
            Pricing
          </SegButton>
          <SegButton active={tab === 'structure'} onClick={() => setTab('structure')}>
            Struktur
          </SegButton>
          <SegButton active={tab === 'language'} onClick={() => setTab('language')}>
            Sprache
          </SegButton>
        </div>
      </div>

      {tab === 'pricing' ? <Pricing me={me as any} /> : null}
      {tab === 'structure' ? <Structure me={me as any} /> : null}
      {tab === 'language' ? <LanguagePanel me={me} /> : null}
    </div>
  );
}
