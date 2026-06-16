import React from 'react';

/**
 * EmptyState component using the Design System `.app-empty` class.
 */
export function EmptyState({ title, message, icon, className = '', children }) {
  return (
    <div className={`app-empty ${className}`}>
      {icon && <div className="app-empty__icon" style={{ marginBottom: 12, fontSize: 24, color: 'var(--color-text-muted)' }}>{icon}</div>}
      {title && <h4 style={{ margin: '0 0 4px', color: 'var(--color-text-primary)' }}>{title}</h4>}
      {message && <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>{message}</p>}
      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}
