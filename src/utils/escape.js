/**
 * escape.js — HTML entity escape yardımcısı
 *
 * innerHTML ile DOM'a eklenen tüm kullanıcı/veri kaynaklı
 * metinlerde XSS koruması sağlar.
 */

/**
 * HTML özel karakterlerini entity'lere dönüştürür.
 * @param {*} value — escape edilecek değer
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
