// src/components/BlockedBanner.tsx
import React from 'react';
import { t } from '../i18n';

export default function BlockedBanner() {
  return (
    <div style={{ position: 'absolute', marginTop: 54, right: 18 }}>
      <div className="badge blink">{t('blockedMsg')}</div>
    </div>
  );
}
