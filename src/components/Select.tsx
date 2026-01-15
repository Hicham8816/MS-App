// src/components/Select.tsx
import React from 'react';

export default function Select({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label: string;
  value: any;
  options: { value: any; label: string }[];
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <div className="small">{label}</div>
      <select disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
