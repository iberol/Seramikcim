/**
 * ErrorBoundary.jsx — R3F sahnesi crash olursa whole-page beyaz yerine
 * anlamlı "Sahne yüklenemedi" ekranı gösterir. Hataları logger'a iletir.
 */
import React from 'react';
import { logger } from '../utils/logger.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('[ErrorBoundary] R3F sahne hatası:', error?.message || error);
    logger.error('[ErrorBoundary] Component stack:', errorInfo?.componentStack?.slice(0, 300));
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: '#0d1117',
            color: '#e4e8ed',
          }}
        >
          <div style={{ maxWidth: 400, padding: '24px 32px', background: '#161b22', border: '1px solid #30363d', borderRadius: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ marginTop: 0, fontSize: 17, color: '#f85149' }}>Sahne yüklenemedi</h2>
            <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 16, lineHeight: 1.5 }}>
              {String(this.state.error?.message || 'Beklenmeyen bir hata oluştu.')}
            </p>
            <button
              onClick={this.reset}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                background: '#238636',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ↺ Yeniden Dene
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
