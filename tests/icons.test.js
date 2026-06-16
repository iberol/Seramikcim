/**
 * icons.test.js — src/icons.js Tabler SVG output testleri
 */
import { describe, it, expect } from 'vitest';
import { iconHTML, setButtonIcon, TABLER_ICONS } from '../src/icons.js';

describe('iconHTML', () => {
  it('geçerli ikon için SVG string döner', () => {
    const svg = iconHTML('home');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('</svg>');
  });

  it('geçersiz ikon ismi için boş string döner', () => {
    expect(iconHTML('nonexistent-icon')).toBe('');
    expect(iconHTML('')).toBe('');
  });

  it('opts.size argümanı SVG boyutuna uygulanır', () => {
    const svg = iconHTML('home', { size: 32 });
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
  });

  it('aria-hidden attribute içeriyor (decorative)', () => {
    expect(iconHTML('sun')).toContain('aria-hidden="true"');
  });
});

describe('TABLER_ICONS', () => {
  it('en az 12 ikon export edilir', () => {
    expect(TABLER_ICONS.length).toBeGreaterThanOrEqual(12);
    expect(TABLER_ICONS).toContain('home');
    expect(TABLER_ICONS).toContain('sun');
    expect(TABLER_ICONS).toContain('moon');
    expect(TABLER_ICONS).toContain('x');
  });
});

describe('setButtonIcon', () => {
  it('null button güvenli (no-op)', () => {
    expect(() => setButtonIcon(null, 'home')).not.toThrow();
  });

  it('label argümanı ile span ekler', () => {
    const btn = document.createElement('button');
    setButtonIcon(btn, 'home', 'Ana Sayfa');
    expect(btn.innerHTML).toContain('<svg');
    expect(btn.innerHTML).toContain('Ana Sayfa');
    expect(btn.classList.contains('has-icon-label')).toBe(true);
  });

  it('label olmadan sadece ikon yerleştirir', () => {
    const btn = document.createElement('button');
    setButtonIcon(btn, 'x');
    expect(btn.innerHTML).toContain('<svg');
    expect(btn.classList.contains('has-icon-label')).toBe(false);
  });
});
