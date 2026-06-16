/**
 * logger.js
 * 
 * Merkezi loglama sistemi.
 * Tüm konsol mesajları bu yapı üzerinden geçer ve standart bir format
 * oluşturur. Uygulamanın farklı aşamalarındaki aksiyonları (State değişimleri, API vs) izlemek için kullanılır.
 */

class Logger {
  constructor() {
    this.enabled = true;
  }

  _formatMessage(level, msg) {
    const time = new Date().toLocaleTimeString();
    return `[${time}] [${level}] ${msg}`;
  }

  _sendToBackend(level, message) {
    if (typeof window === 'undefined' || !window.fetch) return;
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;

    try {
      const p = fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message }),
      });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (e) {}
  }

  info(msg, ...args) {
    if (!this.enabled) return;
    console.info(this._formatMessage('INFO', msg), ...args);
    this._sendToBackend('INFO', msg);
  }

  success(msg, ...args) {
    if (!this.enabled) return;
    console.log(`%c${this._formatMessage('SUCCESS', msg)}`, 'color: #107C10; font-weight: bold;', ...args);
    this._sendToBackend('SUCCESS', msg);
  }

  warn(msg, ...args) {
    if (!this.enabled) return;
    console.warn(this._formatMessage('WARN', msg), ...args);
    this._sendToBackend('WARN', msg);
  }

  error(msg, ...args) {
    if (!this.enabled) return;
    console.error(this._formatMessage('ERROR', msg), ...args);
    this._sendToBackend('ERROR', msg);
  }
}

export const logger = new Logger();

