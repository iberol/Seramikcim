/**
 * theme.test.js — src/theme.js tema yönetimi testleri (jsdom)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getTheme, setTheme, toggleTheme, initTheme } from '../src/theme.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('getTheme', () => {
  it('localStorage boşsa default dark döner', () => {
    expect(getTheme()).toBe('dark');
  });

  it('localStorage geçerli değeri okur', () => {
    localStorage.setItem('seramikcim.theme', 'dark');
    expect(getTheme()).toBe('dark');
  });

  it('geçersiz tema string için dark fallback', () => {
    localStorage.setItem('seramikcim.theme', 'rainbow');
    expect(getTheme()).toBe('dark');
  });
});

describe('setTheme', () => {
  it('geçerli temayı localStorage + html data-theme set eder', () => {
    setTheme('dark');
    expect(localStorage.getItem('seramikcim.theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('geçersiz tema değerini reddeder (no-op)', () => {
    setTheme('dark');
    setTheme('hacker');
    expect(getTheme()).toBe('dark');
  });
});

describe('toggleTheme', () => {
  it('light → dark, dark → light döngüsü', () => {
    setTheme('light');
    expect(toggleTheme()).toBe('dark');
    expect(getTheme()).toBe('dark');
    expect(toggleTheme()).toBe('light');
    expect(getTheme()).toBe('light');
  });
});

describe('initTheme', () => {
  it('document.documentElement data-theme attribute set eder', () => {
    setTheme('dark');
    document.documentElement.removeAttribute('data-theme');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
