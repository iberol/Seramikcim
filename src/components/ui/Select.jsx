import React from 'react';

export function Select({ value, options = [], onChange, label, ariaLabel, id, className = '', ...rest }) {
  const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;
  
  return (
    <div className={`app-input-group ${className}`}>
      {label && <label className="app-label" htmlFor={selectId}>{label}</label>}
      <select
        id={selectId}
        className="app-select"
        value={value}
        onChange={(e) => onChange?.(e.target.value, e)}
        aria-label={ariaLabel || label}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
