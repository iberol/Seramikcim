import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/utils/escape';

describe('escape.js', () => {
  describe('escapeHtml', () => {
    it('escapes common dangerous characters', () => {
      const input = '<script>alert("XSS & hack")</script>';
      const escaped = escapeHtml(input);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; hack&quot;)&lt;/script&gt;');
    });

    it('returns empty string for null or undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('escapes single quotes', () => {
      const input = `onmouseover='alert(1)'`;
      const escaped = escapeHtml(input);
      expect(escaped).toBe('onmouseover=&#39;alert(1)&#39;');
    });

    it('preserves safe strings', () => {
      const input = 'Normal text without symbols';
      expect(escapeHtml(input)).toBe(input);
    });
  });
});
