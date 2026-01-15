// src/pages/admin/Structure.tsx
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function Structure({ me, onlyAdmins }: { me: any; onlyAdmins?: boolean }) {
  const isSupervisor = me?.role === 'supervisor';
  const [branches, setBranches] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [adminBranchId, setAdminBranchId] = useState<number>(1);

  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const b = await api<any[]>('/api/branches');
      setBranches(b);
      if (isSupervisor) {
        const a = await api<any[]>('/api/admins');
        setAdmins(a);
      }
    })();
  }, []);

  if (onlyAdmins) {
    if (!isSupervisor) return <div className="small">Nur Supervisor.</div>;

    return (
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ margin: 0 }}>Admin-Konten</h3>
        {err ? <div className="bad small">{err}</div> : null}

        <div className="row" style={{ marginTop: 10 }}>
          <div className="col">
            <div className="field">
              <div className="small">Admin Username</div>
              <input value={newAdminUser} onChange={(e) => setNewAdminUser(e.target.value)} />
            </div>
          </div>
          <div className="col">
            <div className="field">
              <div className="small">Admin Passwort</div>
              <input value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} />
            </div>
          </div>
          <div className="col">
            <div className="field">
              <div className="small">Filiale</div>
              <select value={adminBranchId} onChange={(e) => setAdminBranchId(Number(e.target.value))}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            setErr('');
            try {
              await api('/api/admins', {
                method: 'POST',
                body: JSON.stringify({ username: newAdminUser, password: newAdminPass, branchId: adminBranchId })
              });
              setNewAdminUser('');
              setNewAdminPass('');
              const a = await api<any[]>('/api/admins');
              setAdmins(a);
            } catch (e: any) {
              setErr(e?.error || 'Fehler');
            }
          }}
        >
          Admin erstellen
        </button>

        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Admin</th>
              <th>Filiale</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.username}</td>
                <td>{a.branchName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>Struktur (CRUD Starter)</h3>
      <div className="small">
        Diese Seite erweitern wir als nächstes vollständig (Filialen/Fakultäten/Fachbereiche/Jahre/Module/Gruppen/Professoren).
        Backend-Endpoints sind schon drin.
      </div>
    </div>
  );
}
