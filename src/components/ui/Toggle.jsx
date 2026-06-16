import React from 'react';

export function Toggle({ checked, onChange, label, id, className = '' }) {
  const inputId = id || `toggle-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label className={`app-toggle ${className}`} htmlFor={inputId}>
      <input
        type="checkbox"
        id={inputId}
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked, e)}
      />
      <span className="app-toggle__switch"></span>
      {label && <span>{label}</span>}
    </label>
  );
}
