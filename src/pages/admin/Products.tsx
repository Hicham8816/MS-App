// src/pages/admin/Products.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import Select from '../../components/Select';

export default function Products({ me }: { me: any }) {
  const isSupervisor = me?.role === 'supervisor';
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState<number | null>(me?.branchId || 1);

  const [settings, setSettings] = useState<any>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      if (!branchId) return;
      const s = await api<any>(`/api/branch-settings/${branchId}`);
      setSettings(s);
      const list = await api<any[]>(`/api/products?branchId=${branchId}&latestN=${s.latestN || 20}`);
      setProducts(list);
    } catch (e: any) {
      setErr(e?.error || 'Fehler');
    }
  }

  useEffect(() => {
    (async () => {
      const b = await api<any[]>('/api/branches');
      setBranches(b);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [branchId]);

  const extraOptions = useMemo(() => {
    const ex = settings?.extras || [];
    return ex.map((x: any) => ({ value: x.key, label: `${x.label} (${x.amount})` }));
  }, [settings]);

  async function updateProduct(id: number, patch: any) {
    await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
    await load();
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>Produktmanager</h3>
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
            {!isSupervisor ? <div className="small">Admin: Filiale fix.</div> : null}
          </div>
        </div>
      </div>

      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Titel</th>
            <th>Seiten</th>
            <th>Preis-Modus</th>
            <th>Extra</th>
            <th>Rabatt</th>
            <th>Notiz</th>
            <th>Sichtbar</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td style={{ minWidth: 220 }}>
                <input
                  value={p.title}
                  onChange={(e) => updateProduct(p.id, { title: e.target.value })}
                />
              </td>
              <td style={{ width: 90 }}>
                <input
                  value={String(p.pages)}
                  inputMode="numeric"
                  onChange={(e) => updateProduct(p.id, { pages: Number(e.target.value || 0) })}
                />
              </td>
              <td style={{ width: 160 }}>
                <select
                  value={p.priceMode}
                  onChange={(e) => updateProduct(p.id, { priceMode: e.target.value })}
                >
                  <option value="AUTO">AUTO</option>
                  <option value="AUTO_PLUS_EXTRA">AUTO + EXTRA</option>
                  <option value="FIXED">FIXED</option>
                </select>
                {p.priceMode === 'FIXED' ? (
                  <input
                    style={{ marginTop: 8 }}
                    value={String(p.fixedPrice ?? '')}
                    inputMode="numeric"
                    onChange={(e) => updateProduct(p.id, { fixedPrice: Number(e.target.value || 0) })}
                    placeholder="Fixed Price"
                  />
                ) : null}
              </td>
              <td style={{ width: 170 }}>
                <select
                  value={p.extraKey ?? ''}
                  onChange={(e) => updateProduct(p.id, { extraKey: e.target.value || null })}
                  disabled={p.priceMode !== 'AUTO_PLUS_EXTRA'}
                >
                  <option value="">—</option>
                  {extraOptions.map((o: any) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </td>
              <td style={{ width: 170 }}>
                <select
                  value={p.discountType}
                  onChange={(e) => updateProduct(p.id, { discountType: e.target.value })}
                >
                  <option value="NONE">NONE</option>
                  <option value="AMOUNT">AMOUNT</option>
                  <option value="PERCENT">PERCENT</option>
                </select>
                {p.discountType !== 'NONE' ? (
                  <input
                    style={{ marginTop: 8 }}
                    value={String(p.discountValue ?? 0)}
                    inputMode="numeric"
                    onChange={(e) => updateProduct(p.id, { discountValue: Number(e.target.value || 0) })}
                    placeholder="Value"
                  />
                ) : null}
              </td>
              <td style={{ minWidth: 180 }}>
                <input
                  value={p.note || ''}
                  onChange={(e) => updateProduct(p.id, { note: e.target.value })}
                  placeholder="Hinweis"
                />
              </td>
              <td style={{ width: 100 }}>
                <select
                  value={p.visible ? '1' : '0'}
                  onChange={(e) => updateProduct(p.id, { visible: e.target.value === '1' })}
                >
                  <option value="1">Ja</option>
                  <option value="0">Nein</option>
                </select>
              </td>
              <td style={{ width: 110 }}>
                <button
                  className="secondary"
                  onClick={async () => {
                    if (!confirm('Produkt wirklich löschen?')) return;
                    await api(`/api/products/${p.id}`, { method: 'DELETE' });
                    await load();
                  }}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
          {!products.length ? (
            <tr>
              <td colSpan={8} className="small">Keine Produkte gefunden</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="small" style={{ marginTop: 10 }}>
        Upload-Integration kommt als nächster Schritt (PDF → Seiten zählen → Produkt anlegen).
      </div>
    </div>
  );
}
