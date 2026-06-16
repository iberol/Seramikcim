import React from 'react';

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  showValue = true,
  unit = '',
  label,
  className = '',
  ...rest
}) {
  return (
    <div className={`app-slider-group ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label className="app-label">{label}</label>
          {showValue && (
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {value}{unit}
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        className="app-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value), e)}
        aria-label={label || 'slider'}
        {...rest}
      />
    </div>
  );
}
