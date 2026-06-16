/**
 * state-helpers.test.js — state.js'in pure formatter export'ları
 */
import { describe, it, expect } from 'vitest';
import {
  fmt,
  cm,
  formatProductSize,
  formatProductType,
  formatCurrency,
  getProductUsageLabel,
} from '../state.js';

describe('fmt', () => {
  it('null/undefined için "0,00"', () => {
    expect(fmt(null)).toBe('0,00');
    expect(fmt(undefined)).toBe('0,00');
  });

  it('TR locale - virgül ondalık ayraç', () => {
    expect(fmt(123.456)).toBe('123,46');
  });

  it('digits parametresi ondalığı belirler', () => {
    expect(fmt(1.5, 0)).toBe('2');
    expect(fmt(1.5, 4)).toBe('1,5000');
  });
});

describe('cm', () => {
  it('metreden cm dönüşümü (round)', () => {
    expect(cm(1.234)).toBe(123);
    expect(cm(0.5)).toBe(50);
    expect(cm(null)).toBe(0);
  });
});

describe('formatProductSize', () => {
  it('null product için "-"', () => {
    expect(formatProductSize(null)).toBe('-');
  });

  it('width × height seramik formatı', () => {
    expect(formatProductSize({ width_m: 0.3, height_m: 0.6 })).toBe('30x60 cm');
  });

  it('width × depth (kare seramik veya fixture)', () => {
    expect(formatProductSize({ width_m: 0.9, depth_m: 0.5 })).toBe('90x50 cm');
  });

  it('length yalnız', () => {
    expect(formatProductSize({ length_m: 1.2 })).toBe('120 cm');
  });
});

describe('formatProductType', () => {
  it('tile → Seramik', () => {
    expect(formatProductType({ type: 'tile' })).toBe('Seramik');
  });
  it('fixture → Armatur', () => {
    expect(formatProductType({ type: 'fixture' })).toBe('Armatur');
  });
  it('null → Urun', () => {
    expect(formatProductType(null)).toBe('Urun');
  });
  it('diğer → Aksesuar', () => {
    expect(formatProductType({ type: 'unknown' })).toBe('Aksesuar');
  });
});

describe('formatCurrency', () => {
  it('null veya 0 için "-"', () => {
    expect(formatCurrency(null)).toBe('-');
    expect(formatCurrency(0)).toBe('-');
  });

  it('TRY formatı (₺ veya TL prefix)', () => {
    const out = formatCurrency(1500);
    expect(out).toMatch(/1\.500|1\s500/); // separator
    expect(out).toMatch(/[₺]|TL/);
  });
});

describe('getProductUsageLabel', () => {
  it('tile için zemin/duvar etiketi', () => {
    expect(getProductUsageLabel({ type: 'tile' })).toContain('Zemin');
  });
  it('drain fixture etiketi', () => {
    expect(getProductUsageLabel({ fixtureKind: 'drain' })).toContain('zemin detayi');
  });
  it('fixture genel etiketi', () => {
    expect(getProductUsageLabel({ type: 'fixture' })).toBe('Yerlesim urunu');
  });
});
