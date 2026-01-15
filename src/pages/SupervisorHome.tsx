// src/pages/SupervisorHome.tsx
import React, { useState } from 'react';
import Settings from './admin/Settings';

export default function SupervisorHome({ me }: { me: any }) {
  const [tab, setTab] = useState<'products' | 'codes' | 'settings'>('settings');

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>Supervisor</h2>
      <div className="nav">
        <div className={`tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Produkte</div>
        <div className={`tab ${tab === 'codes' ? 'active' : ''}`} onClick={() => setTab('codes')}>Codes</div>
        <div className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Einstellungen</div>
      </div>

      <Settings me={me} mode={tab} />
    </div>
  );
}
