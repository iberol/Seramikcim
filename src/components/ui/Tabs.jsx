import React from 'react';

/**
 * Tabs component using the Design System `.app-tabs` classes.
 * 
 * @param {object} props
 * @param {Array<{ id: string, label: string }>} props.tabs
 * @param {string} props.activeId
 * @param {(id: string) => void} props.onChange
 */
export function Tabs({ tabs = [], activeId, onChange, className = '' }) {
  return (
    <div className={`app-tabs ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`app-tabs__btn ${activeId === tab.id ? 'is-active' : ''}`}
          onClick={() => onChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
