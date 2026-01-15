// src/pages/admin/Codes.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import Select from '../../components/Select';

type Code = {
  id: number;
  code: string;
  amount: number;
  status: 'FRESH' | 'SOLD' | 'CONSUMED';
  visibleToAdminUserId: number | null;
};

export default function Codes({ me }: { me: any }) {
  const isSupervisor = me?.role === 'supervisor';
  const [codes, setCodes] = useState<Code[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [err, setErr] = useState('');

  const [amount, setAmount] = useState<number>(500);
  const [count, setCount] = useState<number>(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCodeId, setSelectedCodeId] = useState<number | null>(null);
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null);

  async function reload() {
    setErr('');
    try {
      const list = await api<Code[]>('/api/codes');
      setCodes(list);
      if (isSupervisor) {
        const a = await api<any[]>('/api/admins');
        setAdmins(a);
      }
    } catch (e: any) {
      setErr(e?.error || 'Fehler');
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<number, Code[]> = { 500: [], 1000: [], 2000: [] };
    for (const c of codes) g[c.amount]?.push(c);
    return g;
  }, [codes]);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`Kopiert: ${text}`);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert(`Kopiert: ${text}`);
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>Codes</h3>
      {err ? <div className="bad small">{err}</div> : null}

      {isSupervisor ? (
        <div className="row" style={{ marginTop: 10 }}>
          <div className="col">
            <Select
              label="Betrag"
              value={amount}
              onChange={setAmount}
              options={[
                { value: 500, label: '500 DZD' },
                { value: 1000, label: '1000 DZD' },
                { value: 2000, label: '2000 DZD' }
              ]}
            />
          </div>
          <div className="col">
            <div className="field">
              <div className="small">Anzahl</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="secondary" onClick={() => setCount((c) => Math.max(1, c - 1))}>−</button>
                <input
                  value={String(count)}
                  onChange={(e) => setCount(Number(e.target.value || 1))}
                  inputMode="numeric"
                />
                <button className="secondary" onClick={() => setCount((c) => Math.min(100, c + 1))}>＋</button>
              </div>
            </div>
          </div>
          <div className="col" style={{ display: 'flex', alignItems: 'end' }}>
            <button
              onClick={async () => {
                await api('/api/codes/generate', { method: 'POST', body: JSON.stringify({ amount, count }) });
                await reload();
              }}
            >
              Generieren
            </button>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 14 }}>
        {[500, 1000, 2000].map((amt) => (
          <div key={amt} className="col">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>{amt} DZD</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {grouped[amt].map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                      {c.code}
                    </td>
                    <td className={c.status === 'FRESH' ? 'ok' : c.status === 'SOLD' ? 'bad' : 'small'}>
                      {c.status}
                    </td>
                    <td>
                      {isSupervisor ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {c.visibleToAdminUserId ? (
                            <button
                              className="secondary"
                              onClick={async () => {
                                // hide only if fresh
                                try {
                                  await api('/api/codes/hide', { method: 'POST', body: JSON.stringify({ codeId: c.id }) });
                                  await reload();
                                } catch (e: any) {
                                  alert(e?.error || 'Nicht möglich');
                                }
                              }}
                            >
                              Verstecken
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedCodeId(c.id);
                                setSelectedAdminId(null);
                                setModalOpen(true);
                              }}
                            >
                              Sichtbar
                            </button>
                          )}
                          <span className="small" style={{ marginLeft: 6 }}>Betrag: {c.amount}</span>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            // admin: mark sold + copy
                            try {
                              const r = await api<any>('/api/codes/mark-sold', { method: 'POST', body: JSON.stringify({ codeId: c.id }) });
                              await copyToClipboard(`${r.code} (${r.amount} DZD)`);
                              await reload();
                            } catch (e: any) {
                              alert(e?.error || 'Fehler');
                            }
                          }}
                        >
                          Verkauft + Kopieren
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!grouped[amt].length ? (
                  <tr>
                    <td colSpan={3} className="small">Keine Codes</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} title="Code sichtbar machen" onClose={() => setModalOpen(false)}>
        <Select
          label="Für welchen Admin?"
          value={selectedAdminId}
          onChange={setSelectedAdminId}
          options={admins.map((a) => ({ value: a.id, label: `${a.username} • ${a.branchName}` }))}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            onClick={async () => {
              if (!selectedCodeId || !selectedAdminId) return alert('Bitte Admin auswählen');
              await api('/api/codes/set-visible', {
                method: 'POST',
                body: JSON.stringify({ codeId: selectedCodeId, adminUserId: selectedAdminId })
              });
              setModalOpen(false);
              await reload();
            }}
          >
            Speichern
          </button>
          <button className="secondary" onClick={() => setModalOpen(false)}>Abbrechen</button>
        </div>
      </Modal>
    </div>
  );
}
