/**
 * formatters.js — Ortak sayı/para biçimlendirme yardımcıları
 *
 * main.js ve state.js'ten çıkarıldı. React bileşenleri ve
 * yeni feature modülleri bu lib'i kullanmalı.
 */

/**
 * Sayıyı Türkçe ondalık formatında gösterir.
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function fmt(value, decimals = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Metreyi santimetreye çevirir ve formatlar.
 * @param {number} meters
 * @returns {string}
 */
export function cm(meters) {
  return fmt(meters * 100, 0);
}

/**
 * Türk Lirası formatında para birimi gösterir.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * m² formatı.
 * @param {number} value
 * @returns {string}
 */
export function formatArea(value) {
  return `${fmt(value)} m²`;
}

/**
 * Adet formatı (Türkçe binlik ayırıcı).
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('tr-TR');
}
