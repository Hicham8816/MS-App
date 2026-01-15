// src/pages/UserHome.tsx
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function UserHome({ me }: { me: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const settings = await api<any>(`/api/branch-settings/${me.branchId}`);
        const latestN = settings?.latestN || 20;
        const list = await api<any[]>(`/api/products?latestN=${latestN}`);
        setProducts(list);
      } catch (e: any) {
        setErr(e?.error || 'Fehler beim Laden');
      }
    })();
  }, [me?.branchId]);

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>Produkte</h2>
      {me?.blocked ? (
        <div className="bad small" style={{ marginTop: 10 }}>
          Konto gesperrt – Käufe & Code-Einlösung sind deaktiviert.
        </div>
      ) : null}

      {err ? <div className="bad small">{err}</div> : null}

      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Titel</th>
            <th>Seiten</th>
            <th>Preis</th>
            <th>Rabatt</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div className="small">{p.branchName}</div>
              </td>
              <td>{p.pages}</td>
              <td>
                {p.discountType !== 'NONE' ? (
                  <div>
                    <span className="small" style={{ textDecoration: 'line-through', opacity: 0.65 }}>{p.oldPrice}</span>
                    <div style={{ fontWeight: 800 }}>{p.price} DZD</div>
                  </div>
                ) : (
                  <div style={{ fontWeight: 800 }}>{p.price} DZD</div>
                )}
              </td>
              <td>{p.discountType === 'NONE' ? '—' : '⬇︎'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
