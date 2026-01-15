// src/pages/admin/Pricing.tsx
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function Pricing({ me }: { me: any }) {
  const isSupervisor = me?.role === 'supervisor';
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState<number | null>(me?.branchId || 1);

  const [settings, setSettings] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const b = await api<any[]>('/api/branches');
      setBranches(b);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!branchId) return;
      try {
        const s = await api<any>(`/api/branch-settings/${branchId}`);
        setSettings(s);
      } catch (e: any) {
        setErr(e?.error || 'Fehler');
      }
    })();
  }, [branchId]);

  async function save() {
    setErr('');
    try {
      await api(`/api/branch-settings/${branchId}`, {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      alert('Gespeichert');
    } catch (e: any) {
      setErr(e?.error || 'Fehler');
    }
  }

  if (!settings) return <div className="small">Laden…</div>;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>Pricing pro Filiale</h3>
      {err ? <div className="bad small">{err}</div> : null}

      <div className="row" style={{ marginTop: 10 }}>
        <div className="col">
          <div className="field">
            <div className="small">Filiale</div>
            <select
              value={branchId ?? ''}
              disabled={!isSupervisor}
              onChange={(e) => setBranchId(Number(e.target.value))}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {!isSupervisor ? <div className="small">Admin kann nur eigene Filiale bearbeiten.</div> : null}
          </div>
        </div>

        <div className="col">
          <div className="field">
            <div className="small">Preis pro Seite</div>
            <input
              value={String(settings.pagePrice ?? 10)}
              onChange={(e) => setSettings({ ...settings, pagePrice: Number(e.target.value || 0) })}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="col">
          <div className="field">
            <div className="small">Letzte N Produkte</div>
            <input
              value={String(settings.latestN ?? 20)}
              onChange={(e) => setSettings({ ...settings, latestN: Number(e.target.value || 20) })}
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800 }}>Extras</div>
        {settings.extras?.map((ex: any, idx: number) => (
          <div key={ex.key} className="row" style={{ marginTop: 10 }}>
            <div className="col">
              <div className="field">
                <div className="small">Label</div>
                <input
                  value={ex.label}
                  onChange={(e) => {
                    const extras = [...settings.extras];
                    extras[idx] = { ...extras[idx], label: e.target.value };
                    setSettings({ ...settings, extras });
                  }}
                />
              </div>
            </div>
            <div className="col">
              <div className="field">
                <div className="small">Betrag</div>
                <input
                  value={String(ex.amount)}
                  onChange={(e) => {
                    const extras = [...settings.extras];
                    extras[idx] = { ...extras[idx], amount: Number(e.target.value || 0) };
                    setSettings({ ...settings, extras });
                  }}
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={save}>Speichern</button>
      </div>
    </div>
  );
}
