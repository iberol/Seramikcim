/**
 * AppPanel.jsx — React UI Design System wrapper'ları
 *
 * `src/ui/appPanel.css` atomic class'larını semantic JSX bileşenlerine sarar.
 * Yeni React panellerinin bu library'i kullanması beklenir; legacy DOM
 * panellerine dokunulmaz (CSS class'ları zaten `normalizeFormControls` ile
 * uygulanıyor).
 *
 * Kullanım:
 *   <AppPanel title="..." onClose onMinimize>
 *     <AppPanelSection title="..."><AppPanelRow ... /></AppPanelSection>
 *   </AppPanel>
 */
import React from 'react';
import { Button } from '../../components/ui/Button.jsx';

// UI Bilesenlerini merkezi yerden (src/components/ui) Disari Aktarir (Proxy)
export { Slider as AppPanelSlider } from '../../components/ui/Slider.jsx';
export { Select as AppPanelSelect } from '../../components/ui/Select.jsx';
export { Toggle as AppPanelToggle } from '../../components/ui/Toggle.jsx';
export { Button as AppPanelButton } from '../../components/ui/Button.jsx';

/* ──────────────────── AppPanel ──────────────────── */

export function AppPanel({
  title,
  subtitle,
  icon,
  onClose,
  onMinimize,
  minimized = false,
  actions,
  children,
  className = '',
  style,
  ...rest
}) {
  return (
    <section
      className={`app-panel ${minimized ? 'panel-minimized' : ''} ${className}`}
      style={style}
      {...rest}
    >
      {(title || onClose || onMinimize || actions) && (
        <AppPanelHeader
          title={title}
          subtitle={subtitle}
          icon={icon}
          onClose={onClose}
          onMinimize={onMinimize}
          minimized={minimized}
          actions={actions}
        />
      )}
      {!minimized && <AppPanelBody>{children}</AppPanelBody>}
    </section>
  );
}

/* ──────────────────── AppPanelHeader ──────────────────── */

export function AppPanelHeader({
  title,
  subtitle,
  icon,
  onClose,
  onMinimize,
  minimized,
  actions,
}) {
  return (
    <header className="app-panel__header">
      {icon && <span className="app-panel__icon">{icon}</span>}
      <div style={{ flex: 1 }}>
        {title && <h2 className="app-panel__title">{title}</h2>}
        {subtitle && <p className="app-panel__subtitle">{subtitle}</p>}
      </div>
      {(actions || onMinimize || onClose) && (
        <div className="app-panel__actions">
          {actions}
          {onMinimize && (
            <AppPanelMinimizeButton onClick={onMinimize} pressed={minimized} />
          )}
          {onClose && <AppPanelCloseButton onClick={onClose} />}
        </div>
      )}
    </header>
  );
}

/* ──────────────────── AppPanelBody ──────────────────── */

export function AppPanelBody({ children, className = '', ...rest }) {
  return (
    <div className={`app-panel__body ${className}`} {...rest}>
      {children}
    </div>
  );
}

/* ──────────────────── AppPanelSection ──────────────────── */

export function AppPanelSection({ title, children, className = '' }) {
  return (
    <div className={`app-section ${className}`}>
      {title && <h3 className="app-section__title">{title}</h3>}
      {children}
    </div>
  );
}

/* ──────────────────── AppPanelRow ──────────────────── */

export function AppPanelRow({ label, layout = 'row', children, className = '' }) {
  const layoutClass = layout === 'col' ? 'app-row--col'
    : layout === 'grid-2' ? 'app-row--grid-2'
    : layout === 'grid-4' ? 'app-row--grid-4'
    : '';
  return (
    <div className={`app-row ${layoutClass} ${className}`}>
      {label && <label className="app-label">{label}</label>}
      {children}
    </div>
  );
}

/* ──────────────────── Actions (Close / Minimize) ──────────────────── */

export function AppPanelCloseButton({ onClick }) {
  return (
    <Button
      variant="ghost"
      iconOnly
      ariaLabel="Paneli kapat"
      onClick={onClick}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      }
    />
  );
}

export function AppPanelMinimizeButton({ onClick, pressed = false }) {
  return (
    <Button
      variant="ghost"
      iconOnly
      ariaLabel={pressed ? 'Paneli büyüt' : 'Paneli küçült'}
      onClick={onClick}
      aria-pressed={pressed}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      }
    />
  );
}
