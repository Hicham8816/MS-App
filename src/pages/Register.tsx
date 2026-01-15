// src/pages/Register.tsx
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Select from '../components/Select';
import { getLang } from '../i18n';

export default function Register({ onDone }: { onDone: () => void }) {
  const [branches, setBranches] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  const [branchId, setBranchId] = useState<number | null>(1);
  const [facultyId, setFacultyId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [yearId, setYearId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const b = await api<any[]>('/api/branches');
      setBranches(b);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!branchId) return setFaculties([]);
      const f = await api<any[]>(`/api/faculties?branchId=${branchId}`);
      setFaculties(f);
      setFacultyId(null);
      setDepartmentId(null);
      setYearId(null);
      setModuleId(null);
      setGroupId(null);
    })();
  }, [branchId]);

  useEffect(() => {
    (async () => {
      if (!facultyId) return setDeps([]);
      const d = await api<any[]>(`/api/departments?facultyId=${facultyId}`);
      setDeps(d);
      setDepartmentId(null);
      setYearId(null);
      setModuleId(null);
      setGroupId(null);
    })();
  }, [facultyId]);

  useEffect(() => {
    (async () => {
      if (!departmentId) return setYears([]);
      const y = await api<any[]>(`/api/years?departmentId=${departmentId}`);
      setYears(y);
      setYearId(null);
      setModuleId(null);
      setGroupId(null);
    })();
  }, [departmentId]);

  useEffect(() => {
    (async () => {
      if (!yearId) return setModules([]);
      const m = await api<any[]>(`/api/modules?yearId=${yearId}`);
      setModules(m);
      setModuleId(null);
      setGroupId(null);
    })();
  }, [yearId]);

  useEffect(() => {
    (async () => {
      if (!moduleId) return setGroups([]);
      const g = await api<any[]>(`/api/groups?moduleId=${moduleId}`);
      setGroups(g);
      setGroupId(null);
    })();
  }, [moduleId]);

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>Registrieren</h2>

      <div className="row">
        <div className="col">
          <Select
            label="Filiale"
            value={branchId}
            onChange={setBranchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Select
            label="Fakultät"
            value={facultyId}
            onChange={setFacultyId}
            options={faculties.map((f) => ({ value: f.id, label: f.name }))}
          />
          <Select
            label="Fachbereich"
            value={departmentId}
            onChange={setDepartmentId}
            options={deps.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>

        <div className="col">
          <Select label="Studienjahr" value={yearId} onChange={setYearId} options={years.map((y) => ({ value: y.id, label: y.name }))} />
          <Select label="Modul" value={moduleId} onChange={setModuleId} options={modules.map((m) => ({ value: m.id, label: m.name }))} />
          <Select label="Gruppe" value={groupId} onChange={setGroupId} options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <div className="field">
            <div className="small">Benutzername</div>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <div className="col">
          <div className="field">
            <div className="small">Passwort</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
      </div>

      {err ? <div className="bad small">{err}</div> : null}

      <div className="row" style={{ marginTop: 10 }}>
        <button
          onClick={async () => {
            setErr('');
            try {
              await api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                  username,
                  password,
                  branchId,
                  facultyId,
                  departmentId,
                  yearId,
                  moduleId,
                  groupId,
                  lang: getLang()
                })
              });
              onDone();
            } catch (e: any) {
              setErr(e?.error || 'Fehler');
            }
          }}
        >
          Konto erstellen
        </button>
        <button className="secondary" onClick={onDone}>Zurück</button>
      </div>
    </div>
  );
}
